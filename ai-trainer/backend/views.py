# apps/interview/views.py
# ADD these two new views to your existing views.py
# Keep all existing views — just add interview_chat and submit_all_answers below

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import InterviewSession, InterviewQuestion, InterviewAnswer, InterviewFeedback
from .services.gemini_service import GeminiService


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/interview/chat/
#
# The CORE endpoint for the real-time conversational interview.
# Called after EVERY answer. Returns the next AI-generated question
# that is contextually based on the full conversation so far.
#
# Request body:
# {
#   "session_id": "uuid",
#   "answer_text": "User's spoken/typed answer",
#   "question_number": 3,       ← which question was just answered (1-based)
#   "current_question_id": "uuid"  ← question that was just answered
# }
#
# Response:
# {
#   "next_question": {
#     "id": "uuid",
#     "question_text": "...",
#     "question_number": 4,
#     "category": "technical"
#   },
#   "is_last": false,
#   "questions_answered": 3,
#   "total_questions": 8
# }
# ──────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def interview_chat(request):
    session_id          = request.data.get('session_id')
    answer_text         = request.data.get('answer_text', '').strip()
    question_number     = int(request.data.get('question_number', 1))
    current_question_id = request.data.get('current_question_id')

    if not session_id:
        return Response({'error': 'session_id is required'}, status=400)

    session = get_object_or_404(InterviewSession, id=session_id, user=request.user)

    if session.status == 'completed':
        return Response({'error': 'Session already completed'}, status=409)

    # ── 1. Save the answer for the current question ───────────────────────
    if current_question_id and answer_text:
        try:
            current_q = InterviewQuestion.objects.get(id=current_question_id, session=session)
            InterviewAnswer.objects.update_or_create(
                question=current_q,
                defaults={
                    'answer_text': answer_text,
                }
            )
            # Update session progress
            session.current_question_index = question_number
            session.save(update_fields=['current_question_index'])
        except InterviewQuestion.DoesNotExist:
            pass  # non-fatal

    # ── 2. Build full conversation history from DB ────────────────────────
    # Get all Q&A so far (ordered by question_number)
    all_questions = InterviewQuestion.objects.filter(
        session=session
    ).order_by('question_number').prefetch_related('interviewanswer_set')

    conversation_history = []
    for q in all_questions:
        conversation_history.append({
            'role': 'interviewer',
            'text': q.question_text,
        })
        try:
            ans = q.interviewanswer_set.first()
            if ans and ans.answer_text:
                conversation_history.append({
                    'role': 'candidate',
                    'text': ans.answer_text,
                })
        except Exception:
            pass

    # ── 3. Check if interview is complete ────────────────────────────────
    total_questions = session.total_questions or 8
    next_question_number = question_number + 1

    if next_question_number > total_questions:
        # No more questions — tell frontend to show the submit screen
        session.status = 'in_progress'
        session.save(update_fields=['status'])
        return Response({
            'next_question': None,
            'is_last': True,
            'questions_answered': question_number,
            'total_questions': total_questions,
            'message': 'Interview complete. Ready for evaluation.',
        })

    # ── 4. Get resume context ─────────────────────────────────────────────
    resume_context = "No resume provided."
    if session.resume_id:
        try:
            from .models import Resume
            resume = Resume.objects.get(id=session.resume_id)
            skills_str = ', '.join(resume.skills or []) if resume.skills else ''
            projects_str = ''
            for p in (resume.projects or []):
                if isinstance(p, dict):
                    projects_str += f"- {p.get('name', '')}: {p.get('description', '')[:100]}\n"
            exp_str = ''
            for e in (resume.experience or []):
                if isinstance(e, dict):
                    exp_str += f"- {e.get('title', '')} at {e.get('company', '')}\n"

            resume_context = (
                f"Skills: {skills_str}\n"
                f"Projects:\n{projects_str}"
                f"Experience:\n{exp_str}"
                f"Summary: {resume.summary or ''}"
            ).strip()
        except Exception:
            pass

    # ── 5. Generate next question via Gemini ──────────────────────────────
    try:
        gemini = GeminiService()
        result = gemini.generate_next_question(
            resume_context      = resume_context,
            conversation_history= conversation_history,
            interview_type      = session.interview_type or 'Mixed',
            question_number     = next_question_number,
            total_questions     = total_questions,
        )
    except Exception as e:
        return Response(
            {'error': f'AI question generation failed: {str(e)}'},
            status=503
        )

    # ── 6. Save next question to DB ──────────────────────────────────────
    next_q = InterviewQuestion.objects.create(
        session         = session,
        question_text   = result['question_text'],
        question_number = next_question_number,
        category        = result.get('category', 'general'),
        difficulty      = 2,
        context_used    = f"Q{next_question_number} | Rationale: {result.get('rationale', '')}",
        expected_points = [],
        suggested_time_seconds = 120,
    )

    is_last = (next_question_number >= total_questions)

    return Response({
        'next_question': {
            'id':              str(next_q.id),
            'question_text':   next_q.question_text,
            'question_number': next_question_number,
            'category':        next_q.category,
        },
        'is_last':           is_last,
        'questions_answered': question_number,
        'total_questions':   total_questions,
    })


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/interview/submit-all/
#
# Called ONCE at the end with all Q&A pairs for holistic Gemini evaluation.
# ──────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_all_answers(request):
    session_id = request.data.get('session_id')
    answers    = request.data.get('answers', [])

    if not answers or len(answers) < 1:
        return Response({'error': 'No answers provided'}, status=400)

    session = get_object_or_404(InterviewSession, id=session_id, user=request.user)

    if session.status == 'completed':
        return Response({'error': 'Session already evaluated'}, status=409)

    try:
        gemini     = GeminiService()
        evaluation = gemini.evaluate_full_interview(answers)
    except Exception as e:
        return Response({'error': f'Evaluation failed: {str(e)}'}, status=503)

    # Save per-question scores
    for q_result in evaluation.get('question_results', []):
        try:
            iq = InterviewQuestion.objects.get(id=q_result['questionId'])
            InterviewAnswer.objects.update_or_create(
                question=iq,
                defaults={
                    'answer_text':  q_result.get('answerText', ''),
                    'score':        float(q_result.get('overall_q_score', 0)) * 10,
                    'ai_feedback':  q_result.get('feedback', ''),
                    'strengths':    [q_result.get('strength', '')],
                    'improvements': [q_result.get('improvement', '')],
                }
            )
        except (InterviewQuestion.DoesNotExist, KeyError):
            pass

    # Update session
    scores = evaluation.get('scores', {})
    session.status              = 'completed'
    session.end_time            = timezone.now()
    session.overall_score       = float(evaluation.get('overall_score', 0)) * 10
    session.communication_score = float(scores.get('communication', 0)) * 10
    session.technical_score     = float(scores.get('technical', 0)) * 10
    session.confidence_score    = float(scores.get('confidence', 0)) * 10
    session.save()

    # Save session-level feedback
    InterviewFeedback.objects.update_or_create(
        session=session,
        defaults={
            'overall_summary':  evaluation.get('summary', ''),
            'overall_rating':   _readiness_to_rating(evaluation.get('placement_readiness', '')),
            'strengths':        [evaluation.get('top_strength', '')],
            'weaknesses':       [evaluation.get('top_weakness', '')],
            'suggestions':      evaluation.get('recommendations', []),
            'topic_scores':     {
                'communication':     scores.get('communication', 0),
                'technical':         scores.get('technical', 0),
                'hr':                scores.get('hr', 0),
                'confidence':        scores.get('confidence', 0),
                'structure':         scores.get('structure', 0),
            },
        }
    )

    return Response(evaluation, status=200)


def _readiness_to_rating(readiness: str) -> str:
    mapping = {
        'Exceptional':   'excellent',
        'Ready':         'good',
        'Almost Ready':  'average',
        'Needs Work':    'needs_improvement',
        'Not Ready':     'poor',
    }
    return mapping.get(readiness, 'average')


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/interview/start/
#
# Updated start view — creates session and generates ONLY the FIRST question.
# All subsequent questions come from /chat/ endpoint above.
# ──────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_interview(request):
    interview_type  = request.data.get('interview_type', 'Mixed')
    resume_id       = request.data.get('resume_id')
    total_questions = int(request.data.get('total_questions', 8))

    # Create session
    session = InterviewSession.objects.create(
        user            = request.user,
        resume_id       = resume_id,
        interview_type  = interview_type,
        total_questions = total_questions,
        status          = 'in_progress',
        start_time      = timezone.now(),
        current_question_index = 0,
    )

    # Get resume context for first question
    resume_context = "No resume provided."
    if resume_id:
        try:
            from .models import Resume
            resume = Resume.objects.get(id=resume_id, user=request.user)
            skills_str   = ', '.join(resume.skills or [])
            projects_str = '\n'.join([
                f"- {p.get('name','')}: {p.get('description','')[:100]}"
                for p in (resume.projects or []) if isinstance(p, dict)
            ])
            resume_context = f"Skills: {skills_str}\nProjects:\n{projects_str}\nSummary: {resume.summary or ''}"
        except Exception:
            pass

    # Generate first question
    try:
        gemini = GeminiService()
        result = gemini.generate_next_question(
            resume_context       = resume_context,
            conversation_history = [],       # empty — first question
            interview_type       = interview_type,
            question_number      = 1,
            total_questions      = total_questions,
        )
    except Exception as e:
        session.delete()
        return Response({'error': f'Failed to generate first question: {str(e)}'}, status=503)

    # Save first question to DB
    first_q = InterviewQuestion.objects.create(
        session          = session,
        question_text    = result['question_text'],
        question_number  = 1,
        category         = result.get('category', 'hr'),
        difficulty       = 1,
        context_used     = 'Q1 opener',
        expected_points  = [],
        suggested_time_seconds = 120,
    )

    return Response({
        'session_id': str(session.id),
        'current_question': {
            'id':              str(first_q.id),
            'question_text':   first_q.question_text,
            'question_number': 1,
            'category':        first_q.category,
        },
        'total_questions': total_questions,
        'interview_type':  interview_type,
    }, status=201)

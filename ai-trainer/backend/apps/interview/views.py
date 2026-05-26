"""
Interview Module Views

API endpoints for the AI Interview Module.
"""

from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.http import HttpResponse, FileResponse
from django.utils import timezone
from django.db import transaction
from django.core.files.base import ContentFile
import logging

from .models import Resume, InterviewSession, InterviewQuestion, InterviewAnswer, InterviewFeedback, EvaluationResult
from .serializers import (
    ResumeUploadSerializer, ResumeDetailSerializer, ResumeListSerializer,
    InterviewStartSerializer, InterviewSessionSerializer, InterviewSessionListSerializer,
    InterviewQuestionSerializer, AnswerSubmitSerializer, InterviewAnswerSerializer,
    InterviewFeedbackSerializer, SessionWithFeedbackSerializer, InterviewHistorySerializer
)
from .services import GeminiService, ResumeParser
from .services.report_generator import generate_report_pdf
from services.openai_service import (
    generate_questions,
    evaluate_interview,
    generate_live_question,
    evaluate_live_interview,
)
import json

logger = logging.getLogger(__name__)


# ── Shared resume context builder (I1 fix: DRY) ────────────────────────────────
def _build_resume_context(resume) -> str:
    """Build comprehensive resume context string for AI question generation."""
    if not resume:
        return "No resume provided."
    skills_str = ', '.join(resume.skills or [])
    exp_str = '\n'.join([
        f"- {e.get('title','')}, {e.get('company','')}, {e.get('duration','')}"
        for e in (resume.experience or []) if isinstance(e, dict)
    ])
    edu_str = '\n'.join([
        f"- {e.get('degree','')}, {e.get('institution','')}, {e.get('year','')}"
        for e in (resume.education or []) if isinstance(e, dict)
    ])
    projects_str = '\n'.join([
        f"- {p.get('name','')}: {p.get('description','')[:150]}"
        for p in (resume.projects or []) if isinstance(p, dict)
    ])
    raw_excerpt = (resume.raw_text or '')[:500]
    return (
        f"Summary: {resume.summary or ''}\nSkills: {skills_str}\n"
        f"Experience:\n{exp_str}\nEducation:\n{edu_str}\n"
        f"Projects:\n{projects_str}\nResume Excerpt: {raw_excerpt}"
    )




# ===========================================
# Resume Views
# ===========================================

class ResumeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for resume upload and management.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def get_queryset(self):
        return Resume.objects.filter(user=self.request.user)
    
    def get_serializer_class(self):
        if self.action == 'create':
            return ResumeUploadSerializer
        elif self.action == 'list':
            return ResumeListSerializer
        return ResumeDetailSerializer

    def create(self, request, *args, **kwargs):
        """Upload and parse a resume."""
        serializer = ResumeUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Create resume record
        resume = serializer.save(user=request.user)

        # Step 1: Extract raw text from PDF (mandatory — fail hard if PDF is unreadable)
        try:
            parser = ResumeParser()
            raw_text = parser.extract_text_from_pdf(resume.file)
            resume.raw_text = raw_text
        except Exception as e:
            logger.error(f"PDF text extraction failed: {str(e)}")
            resume.is_parsed = False
            resume.save()
            return Response(
                {
                    **ResumeDetailSerializer(resume).data,
                    'parsing_error': 'Could not read the PDF file. Please make sure the file is not password-protected or corrupted.',
                    'is_parsed': False,
                },
                status=status.HTTP_201_CREATED
            )

        # Step 1.5: Validate that the PDF actually contains resume-like content
        # This catches invoices, receipts, random documents, image-only PDFs, etc.
        text_lower = (raw_text or '').lower()
        text_len = len(raw_text.strip()) if raw_text else 0

        # Check 1: Too little text (scanned image PDF or blank)
        if text_len < 50:
            resume.is_parsed = False
            resume.save()
            return Response(
                {
                    **ResumeDetailSerializer(resume).data,
                    'parsing_error': (
                        'This PDF contains very little readable text. It may be a scanned image or an empty document. '
                        'Please upload a text-based (ATS-friendly) resume in PDF format.'
                    ),
                    'is_parsed': False,
                },
                status=status.HTTP_201_CREATED
            )

        # Check 2: Look for resume-specific keywords
        resume_indicators = [
            'experience', 'education', 'skills', 'projects', 'work history',
            'objective', 'summary', 'qualification', 'certification', 'internship',
            'university', 'college', 'degree', 'b.tech', 'b.e', 'b.sc', 'bca', 'mca',
            'm.tech', 'mba', 'bachelor', 'master', 'cgpa', 'gpa',
            'linkedin', 'github', 'portfolio', 'resume', 'curriculum vitae', 'cv',
            'programming', 'software', 'developer', 'engineer', 'proficient',
        ]
        indicator_count = sum(1 for kw in resume_indicators if kw in text_lower)

        if indicator_count < 3:
            resume.is_parsed = False
            resume.save()
            return Response(
                {
                    **ResumeDetailSerializer(resume).data,
                    'parsing_error': (
                        'This PDF does not appear to be a resume. We could not find key sections like '
                        'Skills, Education, or Experience. Please upload your actual resume in PDF format. '
                        'Tip: Use an ATS-friendly resume template with clear section headings.'
                    ),
                    'is_parsed': False,
                },
                status=status.HTTP_201_CREATED
            )

        # Step 2: Try AI (Gemini) parsing — fall back to regex parser on failure
        ai_parse_failed = False
        try:
            gemini = GeminiService()
            parsed_data = gemini.parse_resume_with_ai(raw_text)
            # Validate the AI returned non-empty data
            if not parsed_data or not isinstance(parsed_data, dict):
                raise ValueError("Gemini returned empty or invalid response")
            if not parsed_data.get('skills') and not parsed_data.get('experience'):
                raise ValueError("Gemini returned empty skills and experience")
        except Exception as e:
            logger.warning(f"Gemini resume parsing failed, falling back to regex parser: {str(e)}")
            ai_parse_failed = True
            parsed_data = {
                'skills':     parser.parse_skills(raw_text),
                'experience': parser.parse_experience(raw_text),
                'education':  parser.parse_education(raw_text),
                'projects':   parser.parse_projects(raw_text),
                'summary':    '',
            }

        # Step 3: Persist parsed data
        resume.skills     = parsed_data.get('skills', [])
        resume.experience = parsed_data.get('experience', [])
        resume.education  = parsed_data.get('education', [])
        resume.projects   = parsed_data.get('projects', [])
        resume.summary    = parsed_data.get('summary', '')
        resume.is_parsed  = True
        resume.save()

        response_data = ResumeDetailSerializer(resume).data

        if ai_parse_failed:
            # Partial success — regex fallback used; skills may be incomplete
            response_data['parsing_warning'] = (
                'AI resume analysis encountered an issue. Your resume was uploaded successfully '
                'and basic skills were extracted. For best results, the interview questions '
                'may be slightly less personalised.'
            )

        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Get resume summary for interview context."""
        resume = self.get_object()
        parser = ResumeParser()
        context = parser.get_context_for_interview({
            'skills': resume.skills,
            'experience': resume.experience,
            'education': resume.education,
            'projects': resume.projects
        })
        return Response({
            'id': str(resume.id),
            'context': context,
            'skills': resume.skills,
            'summary': resume.summary
        })


# ===========================================
# Interview Session Views
# ===========================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_interview(request):
    """
    Start a new interview session.
    Generates ALL 8 questions upfront in a single Gemini call.

    Request body:
    {
        "resume_id": "uuid",           // optional — omit for Quick Interview
        "interview_type": "Technical",  // HR | Technical | Behavioral | Mixed
        "total_questions": 8
    }

    Responses:
        201 — { session_id, questions: [{id, order, text, type}] }
        404 — { error: 'Resume not found' }  (only when resume_id is given but invalid)
        503 — { error: 'Question generation failed: <msg>' }
    """
    resume_id = request.data.get('resume_id')

    # Auto-abandon any stuck in_progress session for this user so they can start fresh
    existing = InterviewSession.objects.filter(
        user=request.user,
        status='in_progress'
    ).first()
    if existing:
        existing.status = 'abandoned'
        existing.end_time = timezone.now()
        existing.save()
        logger.info(f"Auto-abandoned stuck session {existing.id} for user {request.user.id}")

    # Resolve the resume:
    # 1. If resume_id given   → look it up (404 if not found)
    # 2. If no resume_id      → try the user's latest uploaded resume
    # 3. If no resume exists  → use a generic context (Quick Interview mode)
    resume = None
    if resume_id:
        try:
            resume = Resume.objects.get(id=resume_id, user=request.user)
        except Resume.DoesNotExist:
            return Response(
                {'error': 'Resume not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    else:
        # Fallback: use the most recently uploaded resume for this user
        resume = Resume.objects.filter(user=request.user).order_by('-created_at').first()
        # resume may still be None here — that's OK for Quick Interview
        # generate_questions() accepts None and uses a generic context in that case

    interview_type = request.data.get('interview_type', 'Technical')
    # Clamp to safe range — prevents malicious requests generating 1000 questions
    total_questions = max(3, min(20, int(request.data.get('total_questions', 8))))

    # Build a quick-interview context object when no real resume is available
    context_resume = resume
    if context_resume is None:
        # Minimal dict-like context so generate_questions() can build a prompt
        context_resume = {
            'skills':     [],
            'experience': [],
            'education':  [],
            'projects':   [],
            'summary':    '',
        }

    # Generate questions using Gemini — respect user's chosen count
    try:
        raw_questions = generate_questions(context_resume, num_questions=total_questions)
    except Exception as e:
        logger.error(f"Question generation failed: {e}")
        return Response(
            {'error': 'Question generation failed. Please try again later.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    # Create session + all questions atomically
    with transaction.atomic():
        session = InterviewSession.objects.create(
            user=request.user,
            resume=resume,
            interview_type=interview_type,
            total_questions=len(raw_questions),
            status='in_progress',
            start_time=timezone.now(),
            current_question_index=1,
        )

        question_list = []
        for order_num, q in enumerate(raw_questions, start=1):
            question = InterviewQuestion.objects.create(
                session=session,
                question_text=q.get('text', ''),
                question_number=order_num,
                category=q.get('type', 'Technical').lower(),
                difficulty=3,
            )
            question_list.append({
                'id':    str(question.id),
                'order': order_num,
                'text':  question.question_text,
                'type':  q.get('type', 'Technical'),
            })

    return Response(
        {
            'session_id': str(session.id),
            'questions':  question_list,
        },
        status=status.HTTP_201_CREATED
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_question(request, session_id):
    """Get the current question for a session."""
    session = get_object_or_404(
        InterviewSession, id=session_id, user=request.user
    )
    
    if session.status != 'in_progress':
        return Response(
            {'error': 'Interview session is not in progress'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    question = session.questions.filter(
        question_number=session.current_question_index
    ).first()
    
    if not question:
        return Response(
            {'error': 'No question found'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    return Response({
        'session_id': str(session.id),
        'question': InterviewQuestionSerializer(question).data,
        'questions_remaining': session.total_questions - session.current_question_index
    })


# NOTE: submit_answer endpoint has been removed.
# All answers are now submitted together via submit_all() below.


# NOTE: end_interview endpoint has been removed.
# Final evaluation is now handled by submit_all() below.


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_interview_feedback(request, session_id):
    """Get detailed feedback for a completed interview."""
    session = get_object_or_404(
        InterviewSession, id=session_id, user=request.user
    )
    
    if session.status != 'completed':
        return Response(
            {'error': 'Interview not yet completed'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    return Response(SessionWithFeedbackSerializer(session).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def interview_history(request):
    """Get user's interview history."""
    sessions = InterviewSession.objects.filter(
        user=request.user
    ).order_by('-created_at')
    
    # Optional filters
    interview_type = request.query_params.get('type')
    status_filter = request.query_params.get('status')
    
    if interview_type:
        sessions = sessions.filter(interview_type=interview_type)
    if status_filter:
        sessions = sessions.filter(status=status_filter)
    
    # Pagination
    try:
        page = max(1, int(request.query_params.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(request.query_params.get('page_size', 10))))
    except (TypeError, ValueError):
        page_size = 10
    start = (page - 1) * page_size
    end = start + page_size
    
    total = sessions.count()
    sessions = sessions[start:end]
    
    return Response({
        'results': InterviewHistorySerializer(sessions, many=True).data,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size
    })


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_interview(request, session_id):
    """Delete an interview session."""
    session = get_object_or_404(
        InterviewSession, id=session_id, user=request.user
    )
    session.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def interview_stats(request):
    """Get user's interview statistics."""
    sessions = InterviewSession.objects.filter(
        user=request.user,
        status='completed'
    )
    
    total_interviews = sessions.count()
    
    if total_interviews == 0:
        return Response({
            'total_interviews': 0,
            'average_score': 0,
            'best_score': 0,
            'improvement': 0,
            'by_type': {}
        })
    
    scores = [s if s is not None else 0.0 for s in sessions.values_list('overall_score', flat=True)]
    
    avg_score = sum(scores) / total_interviews if total_interviews > 0 else 0
    best_score = max(scores) if scores else 0
    
    # Calculate improvement (last 5 vs first 5)
    if len(scores) >= 2:
        recent = scores[-5:] if len(scores) >= 5 else scores[-len(scores)//2:]
        early = scores[:5] if len(scores) >= 5 else scores[:len(scores)//2]
        improvement = (sum(recent)/len(recent)) - (sum(early)/len(early)) if early else 0
    else:
        improvement = 0
    
    # Stats by type
    by_type = {}
    for interview_type in ['HR', 'Technical', 'Behavioral', 'Mixed']:
        type_sessions = sessions.filter(interview_type=interview_type)
        type_count = type_sessions.count()
        type_scores = [s if s is not None else 0.0 for s in type_sessions.values_list('overall_score', flat=True)]
        by_type[interview_type] = {
            'count': type_count,
            'average_score': sum(type_scores) / type_count if type_count > 0 else 0
        }
    
    return Response({
        'total_interviews': total_interviews,
        'average_score': round(avg_score, 1),
        'best_score': round(best_score, 1),
        'improvement': round(improvement, 1),
        'by_type': by_type
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transcribe_audio(request):
    """POST /api/interview/transcribe/  — audio blob -> text via Cloud STT Chirp 2"""
    audio_file = request.FILES.get("audio")
    if not audio_file:
        logger.warning("[transcribe] No audio file in request")
        return Response({"error": "No audio file. Send as multipart/form-data."}, status=400)
    # Guard: reject uploads > 10 MB (60s of WebM audio is ~1-2 MB)
    MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB
    # C5 fix: check file size BEFORE reading into memory
    if audio_file.size > MAX_AUDIO_BYTES:
        return Response({"error": "Audio file too large. Maximum 60 seconds of recording allowed."}, status=400)
    audio_bytes = audio_file.read()
    logger.info("[transcribe] Received audio: name=%s, size=%d bytes, content_type=%s",
                audio_file.name, len(audio_bytes), audio_file.content_type)
    if len(audio_bytes) < 100:
        logger.warning("[transcribe] Audio too short: %d bytes", len(audio_bytes))
        return Response({"error": "Audio too short or empty."}, status=400)
    language = request.data.get("language", "en-IN")
    try:
        from .services.cloud_stt_service import transcribe_audio_bytes
        text = transcribe_audio_bytes(audio_bytes, language_code=language)
        logger.info("[transcribe] Cloud STT result: '%s' (%d chars)", text[:100] if text else '', len(text) if text else 0)
    except Exception as e:
        logger.error("[transcribe] Cloud STT FAILED: %s", e, exc_info=True)
        return Response({"error": f"Transcription failed: {e}"}, status=503)
    return Response({"text": text, "language": language})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def synthesize_speech(request):
    """POST /api/interview/tts/  — text -> MP3 audio bytes via Cloud TTS Chirp 3 HD"""
    text = request.data.get("text", "").strip()
    if not text:
        return Response({"error": "text field is required."}, status=400)
    if len(text) > 1000:
        return Response({"error": "Text too long (max 1000 chars)."}, status=400)
    try:
        from .services.cloud_tts_service import synthesize_speech as _synth
        audio_bytes = _synth(text)
    except Exception as e:
        logger.error("TTS failed: %s", e)
        return Response({"error": f"Text-to-speech failed: {e}"}, status=503)
    return HttpResponse(audio_bytes, content_type="audio/mpeg")


# ===========================================
# Live Interview Mode Views
# ===========================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def live_start_interview(request):
    """
    POST /api/interview/live/start/
    Creates a session and generates the FIRST question via Gemini.
    Subsequent questions come from /live/chat/.
    """
    interview_type = request.data.get('interview_type', 'Mixed')
    resume_id = request.data.get('resume_id')
    total_questions = max(3, min(20, int(request.data.get('total_questions', 8))))

    # Auto-abandon stuck sessions
    existing = InterviewSession.objects.filter(user=request.user, status='in_progress').first()
    if existing:
        existing.status = 'abandoned'
        existing.end_time = timezone.now()
        existing.save()

    # Resolve resume
    resume = None
    if resume_id:
        try:
            resume = Resume.objects.get(id=resume_id, user=request.user)
        except Resume.DoesNotExist:
            return Response({'error': 'Resume not found'}, status=status.HTTP_404_NOT_FOUND)
    else:
        resume = Resume.objects.filter(user=request.user).order_by('-created_at').first()

    # Build resume context — uses shared helper (I1 fix: DRY)
    resume_context = _build_resume_context(resume)

    # Create session
    with transaction.atomic():
        session = InterviewSession.objects.create(
            user=request.user,
            resume=resume,
            interview_type=interview_type,
            total_questions=total_questions,
            status='in_progress',
            start_time=timezone.now(),
            current_question_index=0,
        )

    # Generate first question
    try:
        result = generate_live_question(
            resume_context=resume_context,
            conversation_history=[],
            interview_type=interview_type,
            question_number=1,
            total_questions=total_questions,
        )
    except Exception as e:
        session.delete()
        logger.error(f"Live Q1 generation failed: {e}")
        return Response({'error': 'Failed to generate first question.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    first_q = InterviewQuestion.objects.create(
        session=session,
        question_text=result['question_text'],
        question_number=1,
        category=result.get('category', 'hr'),
        difficulty=1,
        context_used='Q1 opener',
    )

    return Response({
        'session_id': str(session.id),
        'current_question': {
            'id': str(first_q.id),
            'question_text': first_q.question_text,
            'question_number': 1,
            'category': first_q.category,
        },
        'total_questions': total_questions,
        'interview_type': interview_type,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def live_chat(request):
    """
    POST /api/interview/live/chat/
    Saves the answer, builds conversation history, generates next question.
    """
    session_id = request.data.get('session_id')
    answer_text = request.data.get('answer_text', '').strip()
    question_number = int(request.data.get('question_number', 1))
    current_question_id = request.data.get('current_question_id')

    if not session_id:
        return Response({'error': 'session_id is required'}, status=400)

    session = get_object_or_404(InterviewSession, id=session_id, user=request.user)
    if session.status == 'completed':
        return Response({'error': 'Session already completed'}, status=409)

    # C6 fix: validate question_number bounds
    total_questions = session.total_questions or 8
    actual_answered = InterviewQuestion.objects.filter(session=session).count()
    if question_number < 1 or question_number > actual_answered + 1:
        return Response({'error': 'Invalid question_number'}, status=400)

    # Save the answer (always save when question_id present — even empty answers should be recorded)
    if current_question_id:
        try:
            current_q = InterviewQuestion.objects.get(id=current_question_id, session=session)
            InterviewAnswer.objects.update_or_create(
                question=current_q,
                defaults={'answer_text': answer_text or '[No answer provided]', 'score': 0, 'ai_feedback': ''}
            )
            session.current_question_index = question_number
            session.save(update_fields=['current_question_index'])
        except InterviewQuestion.DoesNotExist:
            pass

    # Build conversation history from DB
    all_questions = InterviewQuestion.objects.filter(
        session=session
    ).order_by('question_number').prefetch_related('answer')

    conversation_history = []
    for q in all_questions:
        conversation_history.append({'role': 'interviewer', 'text': q.question_text})
        try:
            ans = q.answer
            if ans and ans.answer_text:
                conversation_history.append({'role': 'candidate', 'text': ans.answer_text})
        except InterviewAnswer.DoesNotExist:
            pass

    # Check if complete
    total_questions = session.total_questions or 8
    next_number = question_number + 1

    if next_number > total_questions:
        return Response({
            'next_question': None,
            'is_last': True,
            'questions_answered': question_number,
            'total_questions': total_questions,
        })

    # Resume context — uses shared helper (I1 fix: DRY)
    resume_context = _build_resume_context(session.resume)

    # Generate next question
    try:
        result = generate_live_question(
            resume_context=resume_context,
            conversation_history=conversation_history,
            interview_type=session.interview_type or 'Mixed',
            question_number=next_number,
            total_questions=total_questions,
        )
    except Exception as e:
        logger.error(f"Live question generation failed: {e}")
        return Response({'error': f'AI question generation failed: {str(e)}'}, status=503)

    next_q = InterviewQuestion.objects.create(
        session=session,
        question_text=result['question_text'],
        question_number=next_number,
        category=result.get('category', 'general'),
        difficulty=min(5, 1 + next_number // 2),
        context_used=f"Q{next_number} | {result.get('rationale', '')}",
    )

    return Response({
        'next_question': {
            'id': str(next_q.id),
            'question_text': next_q.question_text,
            'question_number': next_number,
            'category': next_q.category,
        },
        'is_last': next_number >= total_questions,
        'questions_answered': question_number,
        'total_questions': total_questions,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def live_submit_all(request):
    """
    POST /api/interview/live/submit-all/
    Collects full transcript from DB and runs holistic Gemini evaluation.
    """
    session_id = request.data.get('session_id')
    if not session_id:
        return Response({'error': 'session_id required'}, status=400)

    session = get_object_or_404(InterviewSession, id=session_id, user=request.user)
    if session.status == 'completed':
        return Response({'error': 'Already evaluated'}, status=409)

    # Build answers from DB
    all_questions = InterviewQuestion.objects.filter(
        session=session
    ).order_by('question_number').prefetch_related('answer')

    answers = []
    for q in all_questions:
        ans_text = '[No answer provided]'
        try:
            if q.answer and q.answer.answer_text:
                ans_text = q.answer.answer_text
        except InterviewAnswer.DoesNotExist:
            pass
        answers.append({
            'questionId': str(q.id),
            'questionText': q.question_text,
            'questionType': q.category or 'general',
            'answerText': ans_text,
        })

    if len(answers) < 1:
        return Response({'error': 'No answers found'}, status=400)

    # Evaluate
    try:
        evaluation = evaluate_live_interview(answers)
    except Exception as e:
        # E5 fix: log exception type explicitly for better debugging
        logger.error("live_submit_all [%s] session=%s: %s", type(e).__name__, session_id, e, exc_info=True)
        msg = 'AI service busy — try again in 30s.' if 'quota' in str(e).lower() \
            else 'Evaluation failed. Please try again.'
        return Response({'error': msg}, status=503)

    # Persist scores
    with transaction.atomic():
        scores = evaluation.get('scores', {})

        def _clamp100(v):
            return round(max(0.0, min(100.0, float(v))), 1)

        overall_score = _clamp100(scores.get('overall', evaluation.get('overall_score', 0)))
        hr_score = _clamp100(scores.get('hr', 0))
        tech_score = _clamp100(scores.get('technical', 0))
        comm_score = _clamp100(scores.get('communication', 0))
        conf_score = _clamp100(scores.get('confidence', 0))
        struct_score = _clamp100(scores.get('structure', 0))

        session.status = 'completed'
        session.end_time = timezone.now()
        session.overall_score = overall_score
        session.communication_score = comm_score
        session.technical_score = tech_score
        session.confidence_score = conf_score
        session.hr_avg_score = hr_score
        session.save()

        result = EvaluationResult.objects.create(
            session=session,
            overall_score=overall_score,
            hr_score=hr_score,
            technical_score=tech_score,
            communication_score=comm_score,
            confidence_score=conf_score,
            structure_score=struct_score,
            summary_feedback=evaluation.get('summary', ''),
            top_strength=evaluation.get('top_strength', ''),
            top_weakness=evaluation.get('top_weakness', ''),
            top_3_recommendations=json.dumps(evaluation.get('recommendations', [])),
            placement_readiness=evaluation.get('placement_readiness', 'needs_work'),
        )

        # Save per-question scores
        for qr in evaluation.get('question_results', []):
            q_index = qr.get('question_index')
            if q_index is None:
                continue
            try:
                question = session.questions.get(question_number=q_index)
                matching = next((a for a in answers if str(a.get('questionId', '')) == str(question.id)), None)
                InterviewAnswer.objects.update_or_create(
                    question=question,
                    defaults={
                        'answer_text': matching.get('answerText', '') if matching else '',
                        'score': float(qr.get('score', 0)),
                        'ai_feedback': qr.get('feedback', ''),
                        'strengths': [qr.get('strength', '')] if qr.get('strength') else [],
                        'improvements': [qr.get('improvement', '')] if qr.get('improvement') else [],
                        'relevance_score': float(qr.get('relevance', 0)),
                        'clarity_score': float(qr.get('communication', 0)),
                        'depth_score': float(qr.get('depth', 0)),
                    }
                )
            except InterviewQuestion.DoesNotExist:
                continue

    return Response({
        'evaluation_id': str(result.id),
        'session_id': str(session.id),
        'overall_score': overall_score,
        'placement_readiness': evaluation.get('placement_readiness', 'needs_work'),
        'summary': evaluation.get('summary', ''),
        'top_strength': evaluation.get('top_strength', ''),
        'top_weakness': evaluation.get('top_weakness', ''),
        'recommendations': evaluation.get('recommendations', []),
        'scores': {
            'hr': hr_score,
            'technical': tech_score,
            'communication': comm_score,
            'confidence': conf_score,
            'structure': struct_score,
        },
        'question_results': evaluation.get('question_results', []),
    }, status=status.HTTP_200_OK)


# ===========================================

# Submit-All Endpoint (BUG-04 Fix)
# ===========================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_all(request):
    """
    Submit ALL 8 answers at once and get a holistic Gemini evaluation.
    Replaces 8 sequential /submit-answer/ calls with a single Gemini call.
    Fixes BUG-04.

    Request body:
    {
        "session_id": "uuid",
        "answers": [
            {
                "questionId":   "uuid",
                "questionText": "...",
                "questionType": "Technical",
                "answerText":   "User's spoken/typed answer"
            },
            ... (8 total)
        ]
    }

    Responses:
        200 — full evaluation dict + evaluation_id + session_id
        400 — { error: 'session_id and answers[] are required' }
        400 — { error: 'Minimum 3 answers required' }
        404 — session not found or wrong user
        409 — { error: 'Session already evaluated' }
        503 — { error: 'Evaluation failed: <msg>' }
    """
    session_id = request.data.get('session_id')
    answers    = request.data.get('answers', [])

    # 400 — basic validation
    if not session_id or not answers:
        return Response(
            {'error': 'session_id and answers[] are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if len(answers) < 3:
        return Response(
            {'error': 'Minimum 3 answers required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 404 — session must belong to this user
    try:
        session = InterviewSession.objects.get(id=session_id, user=request.user)
    except InterviewSession.DoesNotExist:
        return Response(
            {'error': 'Session not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    # 409 — already evaluated
    if session.status == 'completed':
        return Response(
            {'error': 'Session already evaluated'},
            status=status.HTTP_409_CONFLICT
        )

    # 503 — single Gemini holistic evaluation call (BUG-04 fix)
    try:
        evaluation = evaluate_interview(answers)
    except Exception as e:
        # C4 fix: catch all exceptions, not just ValueError
        logger.error("submit_all failed [%s] session=%s: %s", type(e).__name__, session_id, e, exc_info=True)
        msg = 'AI service busy — try again in 30s.' if 'quota' in str(e).lower() \
            else 'Interview evaluation failed. Please try again.'
        return Response(
            {'error': msg},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    # Persist results atomically
    with transaction.atomic():
        scores = evaluation.get('scores', {})

        # All sub-scores come directly from evaluate_interview() which computed
        # them in Python from per-question rubric data — no re-calculation needed.
        overall_score       = float(scores.get('overall',       evaluation.get('overall_score', 0)))
        hr_score            = float(scores.get('hr',            0))
        tech_score          = float(scores.get('technical',     0))
        comm_score          = float(scores.get('communication', 0))
        conf_score          = float(scores.get('confidence',    0))
        struct_score        = float(scores.get('structure',     0))

        # Clamp to 0-100 (already done in evaluate_interview but be defensive)
        def _clamp100(v: float) -> float:
            return round(max(0.0, min(100.0, v)), 1)

        overall_score  = _clamp100(overall_score)
        hr_score       = _clamp100(hr_score)
        tech_score     = _clamp100(tech_score)
        comm_score     = _clamp100(comm_score)
        conf_score     = _clamp100(conf_score)
        struct_score   = _clamp100(struct_score)

        # Update session scores and mark completed
        session.status              = 'completed'
        session.end_time            = timezone.now()
        session.overall_score       = overall_score
        session.communication_score = comm_score
        session.technical_score     = tech_score
        session.confidence_score    = conf_score
        session.hr_avg_score        = hr_score
        session.save()

        # Create EvaluationResult
        result = EvaluationResult.objects.create(
            session                 = session,
            overall_score           = overall_score,
            hr_score                = hr_score,
            technical_score         = tech_score,
            communication_score     = comm_score,
            confidence_score        = conf_score,
            structure_score         = struct_score,
            summary_feedback        = evaluation.get('summary', ''),
            top_strength            = evaluation.get('top_strength', ''),
            top_weakness            = evaluation.get('top_weakness', ''),
            top_3_recommendations   = json.dumps(evaluation.get('recommendations', [])),
            placement_readiness     = evaluation.get('placement_readiness', 'needs_work'),
        )

        # Save per-question AI scores into InterviewAnswer rows
        for qr in evaluation.get('question_results', []):
            q_index = qr.get('question_index')
            if q_index is None:
                continue
            try:
                question = session.questions.get(question_number=q_index)
                q_id_str = str(question.id)

                # Match answer by questionId UUID first, then by position
                matching_answer = next(
                    (a for a in answers
                     if str(a.get('questionId', a.get('question_id', ''))) == q_id_str),
                    None
                )
                if not matching_answer:
                    matching_answer = next(
                        (a for i, a in enumerate(answers, 1) if i == q_index),
                        None
                    )

                answer_text = (
                    matching_answer.get('answerText', matching_answer.get('answer_text', ''))
                    if matching_answer else '[No answer provided]'
                )

                InterviewAnswer.objects.update_or_create(
                    question=question,
                    defaults={
                        'answer_text':  answer_text or '[No answer provided]',
                        'score':        float(qr.get('score', 0)),
                        'ai_feedback':  qr.get('feedback', ''),
                        'strengths':    [qr.get('strength', '')] if qr.get('strength') else [],
                        'improvements': [qr.get('improvement', '')] if qr.get('improvement') else [],
                        'relevance_score':  float(qr.get('relevance',     0)),
                        'clarity_score':    float(qr.get('communication', 0)),
                        'depth_score':      float(qr.get('depth',         0)),
                    }
                )
            except InterviewQuestion.DoesNotExist:
                continue

    return Response(
        {
            'evaluation_id':       str(result.id),
            'session_id':          str(session.id),
            'overall_score':       overall_score,
            'placement_readiness': evaluation.get('placement_readiness', 'needs_work'),
            'summary':             evaluation.get('summary', ''),
            'top_strength':        evaluation.get('top_strength', ''),
            'top_weakness':        evaluation.get('top_weakness', ''),
            'recommendations':     evaluation.get('recommendations', []),
            'scores': {
                'hr':            hr_score,
                'technical':     tech_score,
                'communication': comm_score,
                'confidence':    conf_score,
                'structure':     struct_score,
            },
            'question_results': evaluation.get('question_results', []),
        },
        status=status.HTTP_200_OK
    )


# ===========================================================================
# PDF Report Download
# ===========================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_report(request, session_id):
    """
    GET /api/interview/report/<session_id>/

    Returns a PDF report for the given completed interview session.
    The PDF is generated on first access and cached in EvaluationResult.report_pdf.
    Subsequent requests stream the cached file directly.
    """
    session = get_object_or_404(InterviewSession, id=session_id, user=request.user)

    if session.status != 'completed':
        return Response(
            {'error': 'Report is only available for completed interviews.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        evaluation = session.evaluation  # EvaluationResult (OneToOne)
    except Exception:
        return Response(
            {'error': 'Evaluation data not found. Please complete the interview first.'},
            status=status.HTTP_404_NOT_FOUND
        )

    filename = f"AI_Interview_Report_{str(session.id)[:8]}.pdf"

    # ── Return cached PDF if already generated ──────────────────────────────
    if evaluation.report_pdf and evaluation.report_pdf.name:
        try:
            # M8 fix: use FileResponse to stream the cached PDF instead of loading into memory
            return FileResponse(
                evaluation.report_pdf.open('rb'),
                content_type='application/pdf',
                filename=filename,
                as_attachment=True,
            )
        except Exception:
            pass  # Cache read failed — generate fresh

    # ── Generate PDF ────────────────────────────────────────────────────────
    try:
        pdf_bytes = generate_report_pdf(session)
    except Exception as e:
        logger.error(f"PDF generation failed for session {session_id}: {e}")
        return Response(
            {'error': 'PDF generation failed. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    # ── Cache in the database ────────────────────────────────────────────────
    try:
        evaluation.report_pdf.save(filename, ContentFile(pdf_bytes), save=True)
    except Exception as e:
        logger.warning(f"Could not cache PDF for session {session_id}: {e}")
        # Still return the PDF even if caching fails

    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

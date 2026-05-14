"""
Aptitude API Views
──────────────────
Public endpoints (AllowAny) so quizzes are accessible without login.
Questions are randomised per request using Django's ORDER BY RANDOM().
"""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import AptitudeTopic, AptitudeQuestion


@api_view(['GET'])
@permission_classes([AllowAny])
def list_topics(request):
    """
    GET /api/aptitude/topics/
    Returns all aptitude topics with question counts.
    """
    topics = AptitudeTopic.objects.all()
    data = []
    for t in topics:
        data.append({
            'id': t.id,
            'name': t.name,
            'category': t.category,
            'categoryLabel': t.category_label,
            'icon': t.icon,
            'level': t.level,
            'hasQuiz': t.has_quiz,
            'definition': t.definition,
            'description': t.description,
            'questionCount': t.question_count,
        })
    return Response({'topics': data})


@api_view(['GET'])
@permission_classes([AllowAny])
def get_questions(request):
    """
    GET /api/aptitude/questions/?topic_id=1&count=10
    GET /api/aptitude/questions/?topic_name=Verbal+Reasoning&count=10

    Returns `count` random questions for the given topic.
    Does NOT include correct_answer — that is only revealed on submit.

    topic_id  → numeric AptitudeTopic.id  (used by old static-data flow)
    topic_name → AptitudeTopic.name lookup (used by admin-added topics)
    """
    topic_id   = request.query_params.get('topic_id')
    topic_name = request.query_params.get('topic_name', '').strip()
    count      = int(request.query_params.get('count', 10))

    if not topic_id and not topic_name:
        return Response(
            {'error': 'topic_id or topic_name query param is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Resolve topic_id from name if only name was supplied
    if not topic_id and topic_name:
        try:
            topic_obj = AptitudeTopic.objects.get(name__iexact=topic_name)
            topic_id = topic_obj.id
        except AptitudeTopic.DoesNotExist:
            return Response(
                {'error': f'No topic found with name "{topic_name}"'},
                status=status.HTTP_404_NOT_FOUND
            )
        except AptitudeTopic.MultipleObjectsReturned:
            topic_id = AptitudeTopic.objects.filter(
                name__iexact=topic_name
            ).first().id

    # ORDER BY RANDOM() — different questions every attempt (BUG-03 fix)
    questions = (
        AptitudeQuestion.objects
        .filter(topic_id=topic_id)
        .order_by('?')[:count]
    )

    data = []
    for q in questions:
        data.append({
            'id': q.id,
            'topicId': q.topic_id,
            'text': q.text,
            'options': q.options,
            # NOTE: correct_answer is intentionally omitted here
        })

    return Response({'questions': data, 'count': len(data)})



@api_view(['POST'])
@permission_classes([AllowAny])
def submit_quiz(request):
    """
    POST /api/aptitude/submit/
    Body: { "answers": { "<question_id>": "<selected_answer>", ... } }

    Returns results with correct answers and score.
    """
    answers = request.data.get('answers', {})
    topic_id = request.data.get('topic_id')  # E7 fix: optional topic scope
    if not answers:
        return Response(
            {'error': 'answers dict is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    question_ids = list(answers.keys())
    # E7 fix: scope questions to topic if provided (prevents cross-topic score inflation)
    qs = AptitudeQuestion.objects.filter(id__in=question_ids)
    if topic_id:
        qs = qs.filter(topic_id=topic_id)
    questions = qs
    q_map = {str(q.id): q for q in questions}

    results = []
    correct_count = 0

    for qid, selected in answers.items():
        q = q_map.get(str(qid))
        if not q:
            continue
        # Treat null / empty string as "not answered"
        answered = selected is not None and selected != ''
        is_correct = answered and (selected == q.correct_answer)
        if is_correct:
            correct_count += 1
        results.append({
            'questionId': q.id,
            'selectedAnswer': selected,
            'correctAnswer': q.correct_answer,
            'isCorrect': is_correct,
            'notAnswered': not answered,
        })

    total = len(results)
    score = round((correct_count / total) * 100) if total > 0 else 0

    return Response({
        'score': score,
        'correctCount': correct_count,
        'totalQuestions': total,
        'results': results,
    })

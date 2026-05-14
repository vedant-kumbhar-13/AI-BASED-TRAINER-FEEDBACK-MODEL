"""
Aptitude Admin API Views
─────────────────────────
Staff-only endpoints called from the Django admin panel's custom JS buttons.
These generate content with Gemini/YouTube and return JSON for the JS to
auto-fill the admin form fields.

Endpoints:
  POST /api/aptitude/admin/generate-description/
  POST /api/aptitude/admin/generate-questions/
  POST /api/aptitude/admin/generate-videos/
  POST /api/aptitude/admin/save-generated/      ← saves all at once
"""

import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator

from .models import AptitudeTopic, AptitudeQuestion

logger = logging.getLogger(__name__)


def _get_topic_name(request) -> tuple[str, JsonResponse | None]:
    """Extract and validate topic_name from POST body."""
    import json as _json
    try:
        body = _json.loads(request.body)
    except Exception:
        body = {}
    name = body.get('topic_name', '').strip()
    if not name:
        return '', JsonResponse({'error': 'topic_name is required.'}, status=400)
    return name, None


# ── 1. Generate description ──────────────────────────────────────

@csrf_exempt
@require_POST
@staff_member_required
def generate_description(request):
    """
    POST { "topic_name": "Percentage" }
    → { "definition": "...", "description": "<h2>..." }
    """
    topic_name, err = _get_topic_name(request)
    if err:
        return err

    try:
        from .ai_service import AptitudeAIService
        svc = AptitudeAIService()
        result = svc.generate_description(topic_name)
        return JsonResponse({'ok': True, **result})
    except Exception as e:
        logger.error("generate_description error for '%s': %s", topic_name, e)
        return JsonResponse({'error': str(e)}, status=500)


# ── 2. Generate quiz questions ───────────────────────────────────

@csrf_exempt
@require_POST
@staff_member_required
def generate_questions(request):
    """
    POST { "topic_name": "Percentage", "count": 10 }
    → { "questions": [{ text, option_a, option_b, option_c, option_d, correct_answer }, ...] }
    """
    import json as _json
    topic_name, err = _get_topic_name(request)
    if err:
        return err

    try:
        body = _json.loads(request.body)
    except Exception:
        body = {}
    count = min(int(body.get('count', 10)), 20)

    try:
        from .ai_service import AptitudeAIService
        svc = AptitudeAIService()
        questions = svc.generate_questions(topic_name, count=count)
        return JsonResponse({'ok': True, 'questions': questions, 'count': len(questions)})
    except Exception as e:
        logger.error("generate_questions error for '%s': %s", topic_name, e)
        return JsonResponse({'error': str(e)}, status=500)


# ── 3. Fetch YouTube videos ──────────────────────────────────────

@csrf_exempt
@require_POST
@staff_member_required
def generate_videos(request):
    """
    POST { "topic_name": "Percentage", "count": 5 }
    → { "videos": [{ youtube_id, title, thumbnail_url, channel_name, order }, ...] }
    """
    import json as _json
    topic_name, err = _get_topic_name(request)
    if err:
        return err

    try:
        body = _json.loads(request.body)
    except Exception:
        body = {}
    count = min(int(body.get('count', 5)), 10)

    try:
        from .ai_service import AptitudeAIService
        svc = AptitudeAIService()
        videos = svc.fetch_videos(topic_name, count=count)
        return JsonResponse({'ok': True, 'videos': videos})
    except Exception as e:
        logger.error("generate_videos error for '%s': %s", topic_name, e)
        return JsonResponse({'error': str(e)}, status=500)


# ── 4. Save all generated content at once ───────────────────────

@csrf_exempt
@require_POST
@staff_member_required
def save_generated(request):
    """
    POST {
      "topic_id": 5,              ← existing AptitudeTopic id
      "definition": "...",
      "description": "...",
      "questions": [...],         ← list of question dicts (optional)
      "videos": [...],            ← list of video dicts (optional)
    }

    Saves description to the AptitudeTopic, appends questions, saves videos
    to learning.TopicVideo, and syncs everything back to learning.Topic so
    the content appears on the Learning page immediately.
    """
    import json as _json
    try:
        body = _json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    topic_id = body.get('topic_id')
    if not topic_id:
        return JsonResponse({'error': 'topic_id is required.'}, status=400)

    try:
        topic = AptitudeTopic.objects.get(pk=topic_id)
    except AptitudeTopic.DoesNotExist:
        return JsonResponse({'error': f'Topic {topic_id} not found.'}, status=404)

    saved = {'description': False, 'questions_added': 0, 'videos_saved': 0}

    # ── 1. Update description / definition ──────────────────────
    definition = body.get('definition', '').strip()
    description = body.get('description', '').strip()
    if description:
        topic.description = description
        if definition:
            topic.definition = definition[:500]
        topic.save()
        saved['description'] = True

    # ── 2. Append quiz questions ─────────────────────────────────
    questions = body.get('questions', [])
    for q in questions:
        try:
            AptitudeQuestion.objects.create(
                topic=topic,
                text=q['text'],
                option_a=q['option_a'],
                option_b=q['option_b'],
                option_c=q['option_c'],
                option_d=q['option_d'],
                correct_answer=q['correct_answer'],
            )
            saved['questions_added'] += 1
        except Exception as ex:
            logger.warning("Could not save question for topic %s: %s", topic_id, ex)

    # ── 3. Save videos to learning.TopicVideo ────────────────────
    videos = body.get('videos', [])
    if videos:
        try:
            from apps.learning.models import Topic as LearningTopic, TopicVideo
            learning_topic = LearningTopic.objects.filter(name=topic.name).first()
            if not learning_topic:
                # Auto-create if missing (same logic as admin save_model sync)
                from apps.aptitude.admin import LEARNING_CATEGORIES
                cat = topic.category if topic.category in LEARNING_CATEGORIES else 'quantitative'
                learning_topic, _ = LearningTopic.objects.update_or_create(
                    name=topic.name,
                    defaults={
                        'category': cat, 'icon': topic.icon or '📘',
                        'level': topic.level or 'Beginner',
                        'definition': topic.definition or '',
                        'description': topic.description or '',
                        'has_quiz': True, 'is_archived': False,
                        'order': topic.order,
                    }
                )

            # Update description on the learning topic too
            if description and saved['description']:
                learning_topic.description = description
                if definition:
                    learning_topic.definition = definition[:500]
                learning_topic.save()

            for idx, v in enumerate(videos):
                youtube_id = v.get('youtube_id', '').strip()
                if not youtube_id:
                    continue
                _, created = TopicVideo.objects.get_or_create(
                    topic=learning_topic,
                    youtube_id=youtube_id,
                    defaults={
                        'title': v.get('title', '')[:300],
                        'thumbnail_url': v.get('thumbnail_url', ''),
                        'channel_name': v.get('channel_name', '')[:200],
                        'order': v.get('order', idx),
                    }
                )
                if created:
                    saved['videos_saved'] += 1

        except Exception as ex:
            logger.error("Could not save videos for topic %s: %s", topic_id, ex)
            saved['video_error'] = str(ex)

    return JsonResponse({'ok': True, **saved})

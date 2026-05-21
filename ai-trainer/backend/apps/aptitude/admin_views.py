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

import json
import re
import logging
from typing import Any

from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.admin.views.decorators import staff_member_required

from .models import AptitudeTopic, AptitudeQuestion

logger = logging.getLogger(__name__)

# ── Allowed aptitude topic names whitelist ───────────────────────────────────
# Every legitimate aptitude/reasoning topic that can appear in placement exams.
# The AI buttons will ONLY work for names that are either in this set OR match
# the pattern check below. This prevents searching YouTube for "vedant" etc.

VALID_APTITUDE_TOPICS = {
    # Quantitative Aptitude
    'percentage', 'percentages', 'profit and loss', 'simple interest',
    'compound interest', 'ratio and proportion', 'ratio & proportion',
    'time and work', 'time & work', 'time speed distance',
    'time, speed and distance', 'speed distance time', 'pipes and cisterns',
    'pipes & cisterns', 'mixtures and alligations', 'number system',
    'number systems', 'hcf and lcm', 'hcf & lcm', 'lcm and hcf',
    'averages', 'average', 'ages', 'problems on ages', 'partnership',
    'boats and streams', 'trains', 'problems on trains', 'clocks',
    'calendar', 'calendars', 'mensuration', 'permutation and combination',
    'permutations and combinations', 'probability', 'algebra',
    'quadratic equations', 'surds and indices', 'simplification',
    'approximation', 'number series', 'missing number series',
    'data sufficiency', 'square roots', 'cube roots', 'fractions',
    'decimals', 'arithmetic', 'geometry', 'trigonometry',
    # Data Interpretation
    'bar graphs', 'bar graph', 'line charts', 'line graph', 'pie charts',
    'pie chart', 'tables', 'data tables', 'histogram', 'histograms',
    'caselets', 'mixed graphs', 'radar charts', 'data interpretation',
    'tables and data tables',
    # Logical Reasoning
    'coding and decoding', 'coding decoding', 'blood relations',
    'seating arrangement', 'syllogisms', 'syllogism', 'direction sense',
    'logical puzzles', 'series completion', 'analogy', 'analogies',
    'odd one out', 'classification', 'statement and conclusions',
    'statement and assumptions', 'cause and effect', 'logical reasoning',
    'input output', 'ranking and order', 'inequalities', 'puzzles',
    'alpha numeric series', 'alphanumeric series',
    # Verbal Ability
    'reading comprehension', 'sentence correction', 'fill in the blanks',
    'para jumbles', 'cloze test', 'error spotting', 'idioms and phrases',
    'one word substitution', 'synonyms', 'antonyms', 'vocabulary',
    'verbal ability', 'grammar', 'active passive voice',
    'direct indirect speech',
    # Computer Aptitude
    'computer fundamentals', 'operating systems', 'networking basics',
    'database concepts', 'computer aptitude', 'ms office',
    'internet concepts', 'computer hardware', 'computer software',
    # General Aptitude
    'general aptitude', 'general knowledge', 'current affairs',
}

# ── Regex patterns ───────────────────────────────────────────────────────────

# Allowed characters: letters, digits, spaces, &, -, comma, dot, /
_TOPIC_NAME_PATTERN = re.compile(r'^[A-Za-z][A-Za-z0-9 &\-,\./]{1,59}$')

# Detects "First Last" person-name pattern:
#   Exactly 2 Title-case tokens, neither is a domain word, not in whitelist
_PERSON_NAME_RE = re.compile(r'^[A-Z][a-z]+\s+[A-Z][a-z]+$')

# Any word that can legitimately appear in an aptitude topic name.
# If EITHER word in a 2-word name is here → it cannot be a person name.
_SUBJECT_CONNECTORS = {
    # conjunctions / prepositions
    'and', 'or', 'of', 'the', 'in', 'on', 'by', 'for', 'to', 'with',
    'vs', 'versus',
    # adjectives used in topic names
    'simple', 'compound', 'linear', 'quadratic', 'mixed', 'missing',
    'direct', 'indirect', 'active', 'passive', 'general', 'verbal',
    'logical', 'quantitative', 'alpha', 'numeric', 'alphanumeric',
    'digital', 'basic', 'advanced', 'applied',
    # math / quant domain nouns
    'interest', 'percentage', 'profit', 'loss', 'ratio', 'proportion',
    'speed', 'distance', 'time', 'work', 'pipes', 'boats', 'trains',
    'clocks', 'calendar', 'probability', 'arithmetic', 'algebra',
    'geometry', 'trigonometry', 'mensuration', 'averages', 'fractions',
    'decimals', 'indices', 'surds', 'roots', 'equations', 'simplification',
    'approximation', 'partnership', 'alligation', 'alligations', 'cisterns',
    # reasoning / DI domain nouns
    'series', 'number', 'system', 'problems', 'relations', 'reasoning',
    'ability', 'aptitude', 'interpretation', 'analysis', 'arrangement',
    'completion', 'sense', 'comprehension', 'combination', 'substitution',
    'fundamentals', 'concepts', 'basics', 'charts', 'graphs', 'tables',
    'streams', 'puzzles', 'jumbles', 'sufficiency', 'syllogism',
    'inequalities', 'classification', 'analogies', 'caselets', 'histogram',
    'input', 'output', 'ranking', 'order',
    # verbal domain nouns
    'vocabulary', 'synonyms', 'antonyms', 'grammar', 'speech', 'voice',
    'encoding', 'decoding', 'correction', 'spotting', 'idioms', 'phrases',
    # computer / technical
    'computer', 'internet', 'hardware', 'software', 'networking', 'database',
    'operating', 'statement', 'conclusions', 'assumptions', 'cause', 'effect',
    'detection',
}


def _looks_like_person_name(name: str) -> bool:
    """
    Returns True only when 'name' is almost certainly a human name.

    Checks (all must pass):
      1. Exactly 2 tokens.
      2. Both tokens are Title-Case (regex match).
      3. Full name IS NOT in the VALID_APTITUDE_TOPICS whitelist.
      4. Neither token appears in _SUBJECT_CONNECTORS.

    This means "Simple Interest", "Logical Reasoning", "Number System" etc.
    are all correctly passed as valid topics.
    """
    name_stripped = name.strip()
    tokens = name_stripped.split()

    if len(tokens) != 2:
        return False

    if not _PERSON_NAME_RE.match(name_stripped):
        return False

    # Whitelist check FIRST — fastest exit for known-good topics
    if name_stripped.lower() in VALID_APTITUDE_TOPICS:
        return False

    t0, t1 = tokens[0].lower(), tokens[1].lower()
    if t0 in _SUBJECT_CONNECTORS or t1 in _SUBJECT_CONNECTORS:
        return False

    return True


def _validate_topic_name(name: str) -> str | None:
    """
    Returns an error string if the name is not a valid aptitude topic,
    or None if it passes all checks.

    Rules (in order):
    1. Must match allowed-character pattern.
    2. Must not be a pure number.
    3. Must not look like "FirstName LastName" (person name).
    4. Single-word names must be in the whitelist.
    5. Multi-word names must either be in the whitelist OR contain at least one
       subject keyword — this catches "foo bar" style gibberish.
    """
    name_lower = name.lower().strip()

    # Rule 1 — character set
    if not _TOPIC_NAME_PATTERN.match(name):
        return (
            f'"{name}" contains invalid characters. '
            'Use only letters, digits, spaces, &, hyphens, commas, or dots.'
        )

    # Rule 2 — not a number
    if name_lower.replace(' ', '').isdigit():
        return f'"{name}" is a number, not an aptitude topic.'

    # Rule 3 — person name detection  ← THIS IS THE NEW CHECK
    if _looks_like_person_name(name):
        return (
            f'"{name}" looks like a person\'s name, not an aptitude topic. '
            'Topic names must be academic subjects like "Percentage", '
            '"Time and Work", "Blood Relations", or "Logical Reasoning". '
            'If this is intentional and truly a subject name, please contact '
            'the developer to add it to the approved list.'
        )

    tokens = name_lower.split()
    is_single_word = len(tokens) == 1
    in_whitelist = name_lower in VALID_APTITUDE_TOPICS

    # Rule 4 — single-word must be whitelisted
    if is_single_word and not in_whitelist:
        return (
            f'"{name}" is not a recognised aptitude topic. '
            'Single-word names must be a known subject '
            '(e.g. "Percentage", "Probability", "Averages", "Arithmetic"). '
            'For multi-word topics use at least two words (e.g. "Time and Work").'
        )

    # Rule 5 — multi-word gibberish check (e.g. "foo bar", "hello world")
    if not is_single_word and not in_whitelist:
        has_subject_word = any(t in _SUBJECT_CONNECTORS for t in tokens)
        if not has_subject_word:
            return (
                f'"{name}" does not appear to be a recognised aptitude subject. '
                'Please use a standard subject name such as "Coding and Decoding", '
                '"Data Interpretation", or "Reading Comprehension". '
                'If this is a valid new topic, add it to the VALID_APTITUDE_TOPICS '
                'list in admin_views.py.'
            )

    return None  # passes all checks


def _get_topic_name(request) -> tuple[str, JsonResponse | None]:
    """Extract AND validate topic_name from POST body."""
    try:
        body = json.loads(request.body)
    except Exception:
        body = {}
    name = body.get('topic_name', '').strip()
    if not name:
        return '', JsonResponse({'error': 'topic_name is required.'}, status=400)

    error = _validate_topic_name(name)
    if error:
        return '', JsonResponse({
            'error': error,
            'hint': (
                'Valid examples: "Percentage", "Time and Work", "Blood Relations", '
                '"Logical Reasoning", "Bar Graphs". '
                'Please enter a real aptitude/reasoning subject.'
            ),
        }, status=422)

    return name, None


# ── 1. Generate description ──────────────────────────────────────

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

@require_POST
@staff_member_required
def generate_questions(request):
    """
    POST { "topic_name": "Percentage", "count": 10 }
    → { "questions": [{ text, option_a, option_b, option_c, option_d, correct_answer }, ...] }
    """
    topic_name, err = _get_topic_name(request)
    if err:
        return err

    try:
        body = json.loads(request.body)
    except Exception:
        body = {}
    try:
        count = min(int(body.get('count', 10)), 20)
    except (ValueError, TypeError):
        count = 10

    try:
        from .ai_service import AptitudeAIService
        svc = AptitudeAIService()
        questions = svc.generate_questions(topic_name, count=count)
        return JsonResponse({'ok': True, 'questions': questions, 'count': len(questions)})
    except Exception as e:
        logger.error("generate_questions error for '%s': %s", topic_name, e)
        return JsonResponse({'error': str(e)}, status=500)


# ── 3. Fetch YouTube videos ──────────────────────────────────────

@require_POST
@staff_member_required
def generate_videos(request):
    """
    POST { "topic_name": "Percentage", "count": 5 }
    → { "videos": [{ youtube_id, title, thumbnail_url, channel_name, order }, ...] }
    """
    topic_name, err = _get_topic_name(request)
    if err:
        return err

    try:
        body = json.loads(request.body)
    except Exception:
        body = {}
    try:
        count = min(int(body.get('count', 5)), 10)
    except (ValueError, TypeError):
        count = 5

    try:
        from .ai_service import AptitudeAIService
        svc = AptitudeAIService()
        videos = svc.fetch_videos(topic_name, count=count)
        return JsonResponse({'ok': True, 'videos': videos})
    except Exception as e:
        logger.error("generate_videos error for '%s': %s", topic_name, e)
        return JsonResponse({'error': str(e)}, status=500)


# ── 4. Save all generated content at once ───────────────────────

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
    try:
        body = json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body.'}, status=400)

    topic_id = body.get('topic_id')
    if not topic_id:
        return JsonResponse({'error': 'topic_id is required.'}, status=400)

    try:
        topic = AptitudeTopic.objects.get(pk=topic_id)
    except AptitudeTopic.DoesNotExist:
        return JsonResponse({'error': f'Topic {topic_id} not found.'}, status=404)

    saved: dict[str, Any] = {'description': False, 'questions_added': 0, 'videos_saved': 0}

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
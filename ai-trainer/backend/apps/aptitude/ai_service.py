"""
Aptitude Admin AI Service
──────────────────────────
Uses the same Gemini key pool as the learning module.
Generates:
  • Topic description (HTML tutorial, same format as learning.Topic.description)
  • 10 MCQ questions (same schema as AptitudeQuestion)
  • YouTube video suggestions (same schema as learning.TopicVideo)
"""

import json
import logging
import re
import time

import google.generativeai as genai
from django.conf import settings

from apps.learning.services import fetch_youtube_videos  # reuse exact same YouTube logic

logger = logging.getLogger(__name__)


class AptitudeAIService:
    """
    Thin wrapper around GeminiLearningService pattern.
    Key rotation identical to apps.learning.gemini_service.GeminiLearningService.
    """

    def __init__(self):
        self.api_keys = [k.strip() for k in getattr(settings, 'GEMINI_API_KEYS', []) if k.strip()]
        if not self.api_keys:
            raise ValueError("GEMINI_API_KEYS not configured in settings.")
        self.key_idx = 0
        self._configure()

    def _configure(self):
        genai.configure(api_key=self.api_keys[self.key_idx])
        self.model = genai.GenerativeModel('gemini-2.5-flash')

    def _rotate(self):
        if self.key_idx < len(self.api_keys) - 1:
            self.key_idx += 1
            self._configure()
            return True
        return False

    def _call(self, prompt: str, max_attempts: int = 6) -> str:
        """Call Gemini with key rotation on 429. Returns raw text."""
        for attempt in range(max_attempts):
            try:
                resp = self.model.generate_content(prompt)
                return resp.text.strip()
            except Exception as e:
                err = str(e).lower()
                logger.warning("Gemini attempt %d error: %s", attempt + 1, e)
                if any(x in err for x in ("429", "quota", "exhausted", "too many")):
                    if self._rotate():
                        continue
                    raise RuntimeError("All Gemini API keys exhausted.") from e
                time.sleep(2)
        raise RuntimeError("Gemini: exceeded max retries.")

    # ────────────────────────────────────────────────────────────
    # 1. Generate HTML description (same format as learning.Topic.description)
    # ────────────────────────────────────────────────────────────
    def generate_description(self, topic_name: str) -> dict:
        """
        Returns {'definition': str, 'description': str}
        where description is HTML suitable for rendering in the React app.
        """
        prompt = f"""You are an expert aptitude trainer creating a comprehensive tutorial for a learning platform.
Write a highly-structured, easy-to-understand tutorial on the topic: "{topic_name}".

The tutorial MUST be formatted as valid HTML fragments rendered inside a React web application.
Do NOT use markdown code blocks like ```html. Output raw HTML only.
Do NOT generate <!DOCTYPE html>, <html>, <head>, <style>, or <body> tags.
Only output content fragments: <h2>, <h3>, <p>, <ul>, <div>, etc.

Include these sections:
1. Concept & Definition (explain like teaching a beginner)
2. Important Formulas & Shortcuts (use <ul> lists or simple HTML tables)
3. 2-3 Solved Examples (classic exam-style, step-by-step solutions)
4. Pro-Tips / Mental Math Tricks / Pitfalls to avoid

Formatting rules:
- Use <h2> for main section headers
- Use <h3> for sub-headings like "Example 1"
- Wrap formulas in <div class="formula-box"></div>
- Wrap solved examples in <div class="example-box"></div>
- Emphasize important terms with <strong>
- Content must be strictly focused on aptitude test preparation

Generate the HTML tutorial now:"""

        raw = self._call(prompt)

        # Strip any accidental markdown fences
        for fence in ('```html', '```'):
            if raw.startswith(fence):
                raw = raw[len(fence):]
        if raw.endswith('```'):
            raw = raw[:-3]
        raw = raw.strip()

        # Extract a plain-text definition from the first <p> tag
        m = re.search(r'<p>(.*?)</p>', raw, re.DOTALL | re.IGNORECASE)
        definition = ''
        if m:
            plain = re.sub(r'<[^>]+>', '', m.group(1)).replace('\n', ' ').strip()
            definition = (plain.split('.')[0] + '.') if '.' in plain else plain
        if not definition:
            definition = f"{topic_name} is an important aptitude concept."

        return {
            'definition': definition[:500],
            'description': raw,
        }

    # ────────────────────────────────────────────────────────────
    # 2. Generate 10 MCQ questions (matches AptitudeQuestion schema exactly)
    # ────────────────────────────────────────────────────────────
    def generate_questions(self, topic_name: str, count: int = 10) -> list[dict]:
        """
        Returns a list of dicts:
          [{'text': ..., 'option_a': ..., 'option_b': ...,
            'option_c': ..., 'option_d': ..., 'correct_answer': ...}, ...]
        correct_answer is the FULL TEXT of the correct option (same as DB schema).
        """
        prompt = f"""Generate exactly {count} multiple-choice aptitude questions on the topic: "{topic_name}".

Rules:
- Each question must be exam-level (suitable for campus placement / competitive exams).
- Each question must have exactly 4 options: A, B, C, D.
- correct_answer must be the EXACT FULL TEXT of the correct option (not just "A" or "B").
- Mix difficulty: some easy, some medium, some hard.
- No duplicate questions.

Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
Each element must have exactly these keys:
  "text", "option_a", "option_b", "option_c", "option_d", "correct_answer"

Example format:
[
  {{
    "text": "If 20% of a number is 80, what is 35% of that number?",
    "option_a": "120",
    "option_b": "140",
    "option_c": "160",
    "option_d": "180",
    "correct_answer": "140"
  }}
]

Generate {count} questions for "{topic_name}" now:"""

        raw = self._call(prompt)

        # Strip markdown fences if present
        raw = re.sub(r'^```(?:json)?', '', raw.strip())
        raw = re.sub(r'```$', '', raw.strip()).strip()

        try:
            questions = json.loads(raw)
        except json.JSONDecodeError:
            # Try to extract a JSON array from the response
            m = re.search(r'\[.*\]', raw, re.DOTALL)
            if m:
                questions = json.loads(m.group(0))
            else:
                raise ValueError(f"Gemini did not return valid JSON for questions: {raw[:300]}")

        # Validate and sanitize each question
        validated = []
        required = {'text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'}
        for q in questions:
            if not isinstance(q, dict):
                continue
            if not required.issubset(q.keys()):
                continue
            validated.append({
                'text': str(q['text']).strip(),
                'option_a': str(q['option_a']).strip(),
                'option_b': str(q['option_b']).strip(),
                'option_c': str(q['option_c']).strip(),
                'option_d': str(q['option_d']).strip(),
                'correct_answer': str(q['correct_answer']).strip(),
            })

        return validated[:count]

    # ────────────────────────────────────────────────────────────
    # 3. Fetch YouTube videos (reuses the exact same learning service)
    # ────────────────────────────────────────────────────────────
    def fetch_videos(self, topic_name: str, count: int = 5) -> list[dict]:
        """
        Returns list of dicts matching learning.TopicVideo fields:
          [{'youtube_id', 'title', 'thumbnail_url', 'channel_name', 'order'}, ...]
        """
        return fetch_youtube_videos(query=topic_name, max_results=count)

"""
Gemini AI API calls — question generation and holistic interview evaluation.
Wraps google-generativeai SDK (v0.7+) for use across the interview app.
Supports automatic key rotation when a key hits the free-tier 429 quota.
"""

import os
import re
import json
import time

import google.generativeai as genai

# ---------------------------------------------------------------------------
# API Key Rotation Pool
# Reads GEMINI_API_KEYS (comma-separated) from Django settings / env.
# Falls back to the single GEMINI_API_KEY if the list is not set.
# ---------------------------------------------------------------------------
def _get_api_keys() -> list:
    """Return an ordered list of valid Gemini API keys (must start with AIzaSy)."""
    try:
        from django.conf import settings
        # Prefer the explicit rotation list
        keys_raw = getattr(settings, 'GEMINI_API_KEYS', None) or getattr(settings, 'GEMINI_API_KEY', '')
    except Exception:
        keys_raw = os.getenv('GEMINI_API_KEYS', '') or os.getenv('GEMINI_API_KEY', '')

    # Normalise: keys_raw may already be a list (decouple Csv) or a plain string
    if isinstance(keys_raw, (list, tuple)):
        candidates = [k.strip() for k in keys_raw if k.strip()]
    else:
        candidates = [k.strip() for k in str(keys_raw).split(',') if k.strip()]

    # Only keep real Gemini API keys — they always start with "AIzaSy"
    valid = [k for k in candidates if k.startswith('AIzaSy')]
    if not valid:
        raise ValueError(
            "No valid GEMINI_API_KEY found. Keys must start with 'AIzaSy'. "
            "Get a key from https://aistudio.google.com/app/apikey"
        )
    return valid


# Load keys once at module import time
_API_KEYS: list = _get_api_keys()
_current_key_idx: int = 0

def _configure_next_key(force_idx: int | None = None) -> str:
    """Rotate to the next API key in the pool and configure the SDK. Returns the key used."""
    global _current_key_idx
    if force_idx is not None:
        _current_key_idx = force_idx % len(_API_KEYS)
    key = _API_KEYS[_current_key_idx]
    genai.configure(api_key=key)
    return key

# Configure on first load with the first key
_configure_next_key(0)

MODEL_NAME = 'gemini-2.5-flash'


def _rotate_key_on_quota(current_idx: int) -> int:
    """Rotate to next key when 429 is hit. Returns new index."""
    next_idx = (current_idx + 1) % len(_API_KEYS)
    _configure_next_key(next_idx)
    return next_idx


# ---------------------------------------------------------------------------
# FUNCTION 1: generate_questions(resume)
#
# Generates exactly 8 personalised interview questions from a parsed resume.
# Distribution: Q1=HR opener, Q2=Behavioral, Q3=HR closing, Q4-Q8=Technical
# Returns: list of 8 dicts → [{text: str, type: str}, ...]
# ---------------------------------------------------------------------------
def generate_questions(resume, num_questions=8):
    """
    Generate interview questions tailored to the candidate's resume.

    Args:
        resume (dict or Resume model instance): parsed resume with fields:
            raw_text, skills, experience, education, projects, summary
        num_questions (int): number of questions to generate (default 8)

    Returns:
        list: dicts, each with 'text' (question string) and 'type' (HR/Technical/Behavioral)

    Raises:
        ValueError: if Gemini returns invalid JSON or wrong question count
    """
    # -----------------------------------------------------------------------
    # Build resume context from available fields
    # -----------------------------------------------------------------------
    # Support both dict and Django model instance
    if hasattr(resume, '__dict__'):
        skills      = resume.skills      if hasattr(resume, 'skills')      else []
        experience  = resume.experience  if hasattr(resume, 'experience')   else []
        education   = resume.education   if hasattr(resume, 'education')    else []
        projects    = resume.projects    if hasattr(resume, 'projects')     else []
        summary     = resume.summary     if hasattr(resume, 'summary')      else ''
    else:
        skills      = resume.get('skills', [])
        experience  = resume.get('experience', [])
        education   = resume.get('education', [])
        projects    = resume.get('projects', [])
        summary     = resume.get('summary', '')

    # Extract candidate name + degree from experience/education if available
    candidate_name = 'the candidate'
    if hasattr(resume, 'user') and resume.user:
        first = getattr(resume.user, 'first_name', '')
        last = getattr(resume.user, 'last_name', '')
        if first or last:
            candidate_name = f"{first} {last}".strip()

    degree_branch  = 'Engineering'
    cgpa           = ''

    if education and isinstance(education, list) and len(education) > 0:
        edu = education[0]
        if isinstance(edu, dict):
            degree_branch = edu.get('degree', degree_branch)
            cgpa_val      = edu.get('cgpa', edu.get('gpa', ''))
            if cgpa_val:
                cgpa = f"CGPA: {cgpa_val}"

    # Summarise projects for the prompt
    project_summaries = []
    if isinstance(projects, list):
        for p in projects[:4]:  # cap at 4 to stay within token limit
            if isinstance(p, dict):
                name = p.get('name', '')
                desc = p.get('description', p.get('summary', ''))
                techs = ', '.join(p.get('technologies', []))
                if name:
                    project_summaries.append(f"- {name}: {desc} (Tech: {techs})" if techs else f"- {name}: {desc}")
            elif isinstance(p, str):
                project_summaries.append(f"- {p}")

    # Flatten skills list
    skills_str = ', '.join(skills) if isinstance(skills, list) else str(skills)

    # -----------------------------------------------------------------------
    # Prompt
    # -----------------------------------------------------------------------
    # Build a dynamic question distribution based on the requested count
    distribution_lines = []
    if num_questions <= 3:
        templates = [
            ('HR', 'Warm opening (introduce yourself or tell about background)'),
            ('Technical', 'Reference a skill or project from their resume'),
            ('Behavioral', 'Situation-based question (teamwork, problem-solving)'),
        ]
        for i in range(num_questions):
            t = templates[i % len(templates)]
            distribution_lines.append(f"Q{i+1} - Type: {t[0]} - {t[1]}")
    else:
        # Proportional: ~25% HR/Behavioral, ~75% Technical
        hr_count = max(1, num_questions // 4)
        behavioral_count = max(1, num_questions // 4)
        tech_count = num_questions - hr_count - behavioral_count

        q_num = 1
        for i in range(hr_count):
            distribution_lines.append(f"Q{q_num} - Type: HR - HR or soft-skill question")
            q_num += 1
        for i in range(behavioral_count):
            distribution_lines.append(f"Q{q_num} - Type: Behavioral - Situation-based question")
            q_num += 1
        for i in range(tech_count):
            distribution_lines.append(f"Q{q_num} - Type: Technical - Technical question relevant to resume")
            q_num += 1

    distribution_text = chr(10).join(distribution_lines)

    user_prompt = f"""
Candidate Profile:
- Name: {candidate_name}
- Degree/Branch: {degree_branch}
- {cgpa}
- Skills: {skills_str or 'Not specified'}
- Projects:
{chr(10).join(project_summaries) or '  Not specified'}
- Summary: {summary or 'Not provided'}

Generate exactly {num_questions} interview questions with this distribution:
{distribution_text}

CRITICAL LIMITS:
- Keep every question extremely short and direct (max 15-20 words).
- Avoid lengthy narrative setups.
- Return ONLY a valid JSON array with exactly {num_questions} items.

Format:
[
  {{"text": "question here", "type": "HR"}},
  {{"text": "question here", "type": "Technical"}},
  ...
]
"""

    system_instruction = (
        "You are an expert technical interviewer at a top Indian IT company. "
        "You personalise questions to the candidate's actual resume, but keep them extremely concise. "
        "Return ONLY valid JSON. No preamble. No backticks."
    )

    # -----------------------------------------------------------------------
    # Gemini API call — with automatic key rotation on 429 quota errors
    # -----------------------------------------------------------------------
    key_idx = _current_key_idx
    last_error = None

    for attempt in range(len(_API_KEYS)):
        try:
            _configure_next_key(key_idx)
            model = genai.GenerativeModel(
                model_name=MODEL_NAME,
                system_instruction=system_instruction,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.7,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                )
            )
            response = model.generate_content(user_prompt)
            raw_text = response.text.strip()
            break  # success — exit retry loop
        except Exception as e:
            last_error = e
            err_str = str(e)
            if '429' in err_str or 'quota' in err_str.lower() or 'RATE_LIMIT' in err_str:
                key_idx = (key_idx + 1) % len(_API_KEYS)
                continue  # try next key
            raise  # non-quota error — re-raise immediately
    else:
        raise ValueError(f"All {len(_API_KEYS)} API keys are quota-exhausted. Last error: {last_error}")

    # Strip accidental backtick code fences (```json ... ```)
    raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text)
    raw_text = re.sub(r'\s*```$', '', raw_text)
    raw_text = raw_text.strip()

    try:
        questions = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini returned invalid JSON for questions: {e}\nRaw: {raw_text[:300]}")

    if not isinstance(questions, list) or len(questions) != num_questions:
        raise ValueError(
            f"Expected a list of exactly {num_questions} questions, got {type(questions).__name__} "
            f"with {len(questions) if isinstance(questions, list) else '?'} items."
        )

    # Trim to exact count if Gemini returned extras
    return questions[:num_questions]


# ---------------------------------------------------------------------------
# FUNCTION 2: evaluate_interview(answers)
#
# Sends ALL 8 Q&A pairs to Gemini in ONE call for holistic evaluation.
# This replaces the per-answer approach (BUG-04 fix).
# Returns: full evaluation dict
# ---------------------------------------------------------------------------
def evaluate_interview(answers):
    """
    Holistically evaluate a complete interview using all 8 Q&A pairs at once.
    Single Gemini call — fixes BUG-04 (was 5+ sequential calls before).

    Args:
        answers (list): 8 dicts, each with:
            {questionId, questionText, questionType, answerText}

    Returns:
        dict: full evaluation with scores, feedback, and placement readiness

    Raises:
        ValueError: if Gemini returns invalid JSON or API call fails
    """
    try:
        # -----------------------------------------------------------------------
        # Build a readable transcript from all answers
        # -----------------------------------------------------------------------
        transcript_lines = []
        for i, ans in enumerate(answers, start=1):
            q_text   = ans.get('questionText', ans.get('question_text', f'Question {i}'))
            q_type   = ans.get('questionType', ans.get('question_type', 'Technical'))
            a_text   = ans.get('answerText',   ans.get('answer_text',   '[No answer provided]'))
            transcript_lines.append(
                f"Q{i} [{q_type}]: {q_text}\n"
                f"Answer: {a_text}"
            )

        transcript = "\n\n".join(transcript_lines)

        # -----------------------------------------------------------------------
        # Prompt
        # -----------------------------------------------------------------------
        user_prompt = f"""
Below is the complete transcript of an interview.
Evaluate the candidate holistically and concisely.

--- TRANSCRIPT START ---
{transcript}
--- TRANSCRIPT END ---

CRITICAL LIMITS:
- Keep textual feedback extremely brief and direct to save tokens.
- Return ONLY a valid JSON object with exact structure.

{{
  "overall_score": <float 0.0-10.0>,
  "placement_readiness": <"not_ready"|"needs_work"|"almost_ready"|"ready"|"highly_ready">,
  "summary": "<2-3 sentence brief assessment>",
  "top_strength": "<single brief strength>",
  "top_weakness": "<single brief area to improve>",
  "recommendations": [
    "<short recommendation 1>",
    "<short recommendation 2>",
    "<short recommendation 3>"
  ],
  "scores": {{
    "overall": <float 0.0-10.0>,
    "hr": <float 0.0-10.0>,
    "technical": <float 0.0-10.0>,
    "communication": <float 0.0-10.0>,
    "confidence": <float 0.0-10.0>,
    "structure": <float 0.0-10.0>
  }},
  "question_results": [
    {{
      "question_index": <1-8>,
      "score": <float 0.0-10.0>,
      "feedback": "<1-2 sentence brief feedback>",
      "strength": "<one brief strength>",
      "improvement": "<one brief improvement>"
    }}
  ]
}}
"""

        system_instruction = (
            "You are an unbiased expert HR evaluator. "
            "Evaluate answers fairly but extremely concisely. "
            "Return ONLY valid JSON. Scores are 0.0-10.0. No preamble."
        )

        # -----------------------------------------------------------------------
        # Gemini API call — with automatic key rotation on 429 quota errors
        # -----------------------------------------------------------------------
        key_idx = _current_key_idx
        last_error = None
        raw_text = ''

        for attempt in range(len(_API_KEYS)):
            try:
                _configure_next_key(key_idx)
                model = genai.GenerativeModel(
                    model_name=MODEL_NAME,
                    system_instruction=system_instruction,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.2,
                        max_output_tokens=8192,
                        response_mime_type="application/json",
                    )
                )
                response = model.generate_content(user_prompt)
                raw_text = response.text.strip()
                break  # success — exit retry loop
            except Exception as e:
                last_error = e
                err_str = str(e)
                if '429' in err_str or 'quota' in err_str.lower() or 'RATE_LIMIT' in err_str:
                    key_idx = (key_idx + 1) % len(_API_KEYS)
                    continue  # try next key
                raise ValueError(f"Interview evaluation failed: {str(e)}")
        else:
            raise ValueError(f"All {len(_API_KEYS)} API keys are quota-exhausted. Last error: {last_error}")

        # Strip accidental backtick code fences
        raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text)
        raw_text = re.sub(r'\s*```$', '', raw_text)
        raw_text = raw_text.strip()

        try:
            evaluation = json.loads(raw_text)
        except json.JSONDecodeError as e:
            raise ValueError(f"Gemini returned invalid JSON for evaluation: {e}\nRaw: {raw_text[:300]}")

        return evaluation

    except (ValueError, json.JSONDecodeError):
        raise  # re-raise our own formatted errors as-is
    except Exception as e:
        raise ValueError(f"Interview evaluation failed: {str(e)}")

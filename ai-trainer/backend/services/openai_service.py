"""
Gemini AI Service — Question Generation & Interview Evaluation
Uses google-generativeai SDK (same as before) with gemini-2.5-flash.

All aggregate scores are computed IN PYTHON from per-question rubric data —
zero risk of Gemini returning inconsistent numbers.

Token budgets:
  generate_questions  : 2 048 output tokens
  evaluate_interview  : 4 096 output tokens
"""

import os
import re
import json
import logging

import google.generativeai as genai

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# API Key Rotation Pool
# ---------------------------------------------------------------------------

def _get_api_keys() -> list:
    """Return an ordered list of valid Gemini API keys (must start with AIzaSy)."""
    try:
        from django.conf import settings
        keys_raw = (
            getattr(settings, "GEMINI_API_KEYS", None)
            or getattr(settings, "GEMINI_API_KEY", "")
        )
    except Exception:
        keys_raw = os.getenv("GEMINI_API_KEYS", "") or os.getenv("GEMINI_API_KEY", "")

    if isinstance(keys_raw, (list, tuple)):
        candidates = [k.strip() for k in keys_raw if k.strip()]
    else:
        candidates = [k.strip() for k in str(keys_raw).split(",") if k.strip()]

    valid = [k for k in candidates if k.startswith("AIzaSy") or k.startswith("AQ.")]
    if not valid:
        raise ValueError(
            "No valid GEMINI_API_KEY found. Keys must start with 'AIzaSy'. "
            "Get a key from https://aistudio.google.com/app/apikey"
        )
    return valid


_API_KEYS: list = _get_api_keys()
_current_key_idx: int = 0

# Single model used for everything — tested and confirmed working
MODEL_NAME = "gemini-2.5-flash"


def _configure(idx: int):
    genai.configure(api_key=_API_KEYS[idx])


# Configure on startup
_configure(0)


def _call_gemini(prompt: str, system: str, max_output_tokens: int, temperature: float) -> str:
    """
    Call Gemini with automatic key rotation on quota / invalid-key errors.
    Returns the raw response text (stripped).
    """
    global _current_key_idx
    last_error = None

    for attempt in range(len(_API_KEYS)):
        key_idx = (_current_key_idx + attempt) % len(_API_KEYS)
        _configure(key_idx)
        try:
            model = genai.GenerativeModel(
                model_name=MODEL_NAME,
                system_instruction=system,
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_output_tokens,
                ),
            )
            response = model.generate_content(prompt)
            _current_key_idx = key_idx  # remember the working key
            return (response.text or "").strip()
        except Exception as e:
            last_error = e
            err_str = str(e)
            if any(tag in err_str for tag in ("429", "quota", "RATE_LIMIT", "API_KEY_INVALID", "API key expired", "RESOURCE_EXHAUSTED")):
                logger.warning("Gemini key[%d] quota/invalid — rotating. Error: %s", key_idx, err_str[:120])
                continue
            raise  # non-quota error — re-raise immediately

    raise ValueError(
        f"All {len(_API_KEYS)} API keys are quota-exhausted or invalid. "
        f"Last error: {last_error}"
    )


def _repair_truncated_json(raw: str) -> str:
    """
    Attempt to repair JSON that was truncated mid-output by Gemini.
    Closes unclosed strings, arrays, and objects.
    """
    # If it already parses, return as-is
    try:
        json.loads(raw)
        return raw
    except json.JSONDecodeError:
        pass

    # Step 1: Close any unclosed string
    in_string = False
    escape = False
    for ch in raw:
        if escape:
            escape = False
            continue
        if ch == '\\':
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
    if in_string:
        raw += '"'

    # Step 2: Remove any trailing comma or incomplete key-value
    raw = re.sub(r',\s*$', '', raw.rstrip())

    # Step 3: Close unclosed brackets/braces
    stack = []
    in_str = False
    esc = False
    for ch in raw:
        if esc:
            esc = False
            continue
        if ch == '\\':
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch in ('{', '['):
            stack.append('}' if ch == '{' else ']')
        elif ch in ('}', ']'):
            if stack:
                stack.pop()

    # Close all unclosed brackets in reverse order
    raw += ''.join(reversed(stack))

    return raw


def _parse_json(raw: str, context: str = "") -> any:
    """Strip markdown fences and parse JSON. Attempts repair if truncated."""
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw)
    raw = raw.strip()

    # Jump to first JSON bracket if there is prose before it
    first = min(
        raw.find("[") if raw.find("[") != -1 else len(raw),
        raw.find("{") if raw.find("{") != -1 else len(raw),
    )
    if first > 0:
        raw = raw[first:]

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Attempt automatic repair of truncated JSON
    repaired = _repair_truncated_json(raw)
    try:
        logger.warning(f"JSON repair succeeded for {context}")
        return json.loads(repaired)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Gemini returned invalid JSON{' for ' + context if context else ''}. "
            f"Error: {exc}. Raw (first 400 chars): {raw[:400]}"
        )


# ---------------------------------------------------------------------------
# FUNCTION 1: generate_questions
# ---------------------------------------------------------------------------

def generate_questions(resume, num_questions: int = 8) -> list:
    """
    Generate num_questions interview questions personalised to the resume.
    Returns list of dicts: [{"text": str, "type": "HR|Technical|Behavioral"}, ...]
    """
    # ── Extract resume fields ──────────────────────────────────────────────
    if hasattr(resume, "__dict__"):
        skills     = getattr(resume, "skills",     []) or []
        experience = getattr(resume, "experience", []) or []
        education  = getattr(resume, "education",  []) or []
        projects   = getattr(resume, "projects",   []) or []
        summary    = getattr(resume, "summary",    "") or ""
    else:
        skills     = resume.get("skills",     []) or []
        experience = resume.get("experience", []) or []
        education  = resume.get("education",  []) or []
        projects   = resume.get("projects",   []) or []
        summary    = resume.get("summary",    "") or ""

    # Candidate name
    candidate_name = "the candidate"
    if hasattr(resume, "user") and resume.user:
        first = getattr(resume.user, "first_name", "") or ""
        last  = getattr(resume.user, "last_name",  "") or ""
        if first or last:
            candidate_name = f"{first} {last}".strip()

    # Education
    degree_branch = "Engineering"
    cgpa_str = ""
    if education and isinstance(education, list):
        edu0 = education[0]
        if isinstance(edu0, dict):
            degree_branch = edu0.get("degree", degree_branch)
            cgpa_val = edu0.get("cgpa", edu0.get("gpa", ""))
            if cgpa_val:
                cgpa_str = f"CGPA/GPA: {cgpa_val}"

    # Projects (cap at 3)
    project_lines = []
    if isinstance(projects, list):
        for p in projects[:3]:
            if isinstance(p, dict):
                name  = p.get("name", "")
                desc  = p.get("description", p.get("summary", ""))[:80]
                techs = ", ".join(p.get("technologies", []))
                if name:
                    project_lines.append(
                        f"  - {name}: {desc} (Tech: {techs})" if techs else f"  - {name}: {desc}"
                    )
            elif isinstance(p, str):
                project_lines.append(f"  - {p[:80]}")

    skills_str = ", ".join(skills[:15]) if skills else "Not specified"

    # ── Question distribution ──────────────────────────────────────────────
    if num_questions <= 3:
        templates = [
            ("HR",         "warm opener — introduce yourself"),
            ("Technical",  "specific technical skill or project from resume"),
            ("Behavioral", "situation-based — teamwork or problem solving"),
        ]
        dist_lines = [f"Q{i+1} [{templates[i % 3][0]}]: {templates[i % 3][1]}" for i in range(num_questions)]
    else:
        hr_count         = max(1, num_questions // 4)
        behavioral_count = max(1, num_questions // 4)
        tech_count       = num_questions - hr_count - behavioral_count
        dist_lines = (
            [f"Q{q}  [HR]         HR/soft-skill"           for q in range(1, hr_count + 1)]
            + [f"Q{q}  [Behavioral] Situation-based"       for q in range(hr_count + 1, hr_count + behavioral_count + 1)]
            + [f"Q{q}  [Technical]  Technical from resume" for q in range(hr_count + behavioral_count + 1, num_questions + 1)]
        )

    dist_text = "\n".join(dist_lines)

    prompt = f"""Candidate profile:
- Name: {candidate_name}
- Degree: {degree_branch}  {cgpa_str}
- Skills: {skills_str}
- Projects:
{chr(10).join(project_lines) or "  Not specified"}
- Summary: {summary[:200] or "Not provided"}

Generate EXACTLY {num_questions} interview questions using this distribution:
{dist_text}

Rules:
- Each question MUST be under 20 words — short and direct.
- Technical questions MUST reference a specific skill or project from the profile.
- Return ONLY a valid JSON array. No prose, no markdown, no backticks.

Format:
[
  {{"text": "question text", "type": "HR"}},
  {{"text": "question text", "type": "Technical"}},
  ...
]"""

    system = (
        "You are an expert technical interviewer. "
        "Personalise every question to the candidate's actual resume. "
        "Return ONLY valid JSON — no preamble, no backticks, no trailing text."
    )

    raw = _call_gemini(prompt, system, max_output_tokens=2048, temperature=0.7)
    questions = _parse_json(raw, context="question generation")

    if not isinstance(questions, list):
        raise ValueError(f"Expected a JSON array of questions, got {type(questions).__name__}")

    validated = []
    for item in questions:
        if isinstance(item, dict) and item.get("text"):
            validated.append({
                "text": str(item["text"]).strip(),
                "type": str(item.get("type", "Technical")).strip(),
            })

    # M5 fix: accept partial results if they meet a reasonable threshold
    # Only fail if Gemini returned far fewer than requested (less than ~60%)
    min_acceptable = max(3, num_questions - 2)
    if len(validated) < min_acceptable:
        raise ValueError(
            f"Gemini returned {len(validated)} valid questions, "
            f"expected at least {min_acceptable} (requested {num_questions})."
        )

    return validated[:num_questions]


# ---------------------------------------------------------------------------
# FUNCTION 2: evaluate_interview — RUBRIC-BASED, PYTHON MATH
# ---------------------------------------------------------------------------

def evaluate_interview(answers: list) -> dict:
    """
    Evaluate all Q&A pairs with a per-question rubric.

    Rubric per question (Gemini scores 0–10 each):
      relevance     — did the answer address the question?
      depth         — technical / conceptual depth
      communication — clarity, structure, grammar
      confidence    — specificity, assertiveness, examples

    All aggregate scores are computed IN PYTHON — not from Gemini's guess.
    """
    if not answers:
        raise ValueError("No answers provided for evaluation.")

    # Build transcript
    transcript_lines = []
    for i, ans in enumerate(answers, start=1):
        q_text = str(ans.get("questionText", ans.get("question_text", f"Question {i}"))).strip()
        q_type = str(ans.get("questionType", ans.get("question_type", "Technical"))).strip()
        a_text = str(ans.get("answerText",   ans.get("answer_text",   "[No answer provided]"))).strip()
        transcript_lines.append(
            f"Q{i} [Type: {q_type}]\nQuestion: {q_text}\nAnswer: {a_text}"
        )

    transcript = "\n\n".join(transcript_lines)
    n = len(answers)

    prompt = f"""You are evaluating a job-interview transcript with {n} questions.

For EACH question, score the answer on four rubric dimensions (0.0-10.0 each):
  - relevance:     Did the answer actually address what was asked?
  - depth:         Technical accuracy, conceptual depth, detail level.
  - communication: Clarity, logical structure, grammar.
  - confidence:    Specificity, concrete examples, assertiveness.

Also provide ONE brief sentence of feedback and ONE key improvement tip per question.
Then provide a short overall assessment (2-3 sentences) and placement readiness.

TRANSCRIPT:
{transcript}

Return ONLY this exact JSON structure — no prose, no markdown:
{{
  "question_results": [
    {{
      "question_index": 1,
      "relevance":      <float 0.0-10.0>,
      "depth":          <float 0.0-10.0>,
      "communication":  <float 0.0-10.0>,
      "confidence":     <float 0.0-10.0>,
      "feedback":       "<1-sentence feedback>",
      "strength":       "<one specific strength>",
      "improvement":    "<one specific improvement>"
    }}
  ],
  "summary":             "<2-3 sentence overall assessment>",
  "top_strength":        "<single biggest strength>",
  "top_weakness":        "<single most important area to improve>",
  "recommendations": [
    "<short recommendation 1>",
    "<short recommendation 2>",
    "<short recommendation 3>"
  ],
  "placement_readiness": "<not_ready|needs_work|almost_ready|ready|highly_ready>"
}}"""

    system = (
        "You are an unbiased expert HR evaluator. "
        "Score answers STRICTLY on their merit. "
        "Return ONLY valid JSON. No preamble. Scores must be floats 0.0-10.0."
    )

    raw = _call_gemini(prompt, system, max_output_tokens=8192, temperature=0.2)
    data = _parse_json(raw, context="interview evaluation")

    # ── Compute ALL aggregate scores in Python ─────────────────────────────
    qr_list = data.get("question_results", [])
    if not qr_list:
        raise ValueError("Gemini returned no question_results in evaluation response.")

    def _clamp(val: float) -> float:
        try:
            return round(max(0.0, min(10.0, float(val))), 1)
        except (TypeError, ValueError):
            return 0.0

    def _to_100(val: float) -> float:
        return round(val * 10, 1)

    normalised_results = []
    for qr in qr_list:
        rel  = _clamp(qr.get("relevance",     0))
        dep  = _clamp(qr.get("depth",         0))
        comm = _clamp(qr.get("communication", 0))
        conf = _clamp(qr.get("confidence",    0))
        per_q_score = _to_100((rel + dep + comm + conf) / 4)

        normalised_results.append({
            "question_index": qr.get("question_index", len(normalised_results) + 1),
            "score":          per_q_score,
            "relevance":      _to_100(rel),
            "depth":          _to_100(dep),
            "communication":  _to_100(comm),
            "confidence":     _to_100(conf),
            "feedback":       str(qr.get("feedback",    "")).strip(),
            "strength":       str(qr.get("strength",    "")).strip(),
            "improvement":    str(qr.get("improvement", "")).strip(),
        })

    # Aggregate by question type
    tech_scores:  list = []
    hr_scores:    list = []
    all_comms:    list = []
    all_confs:    list = []
    all_scores:   list = []

    for i, ans in enumerate(answers):
        q_type = str(ans.get("questionType", ans.get("question_type", "Technical"))).lower()
        if i < len(normalised_results):
            nr = normalised_results[i]
            all_scores.append(nr["score"])
            all_comms.append(nr["communication"])
            all_confs.append(nr["confidence"])
            if "technical" in q_type:
                tech_scores.append(nr["score"])
            elif "hr" in q_type:
                hr_scores.append(nr["score"])

    def _mean(lst: list) -> float:
        return round(sum(lst) / len(lst), 1) if lst else 0.0

    technical_score     = _mean(tech_scores) if tech_scores else _mean(all_scores)
    hr_score            = _mean(hr_scores)   if hr_scores   else _mean(all_scores)
    communication_score = _mean(all_comms)
    confidence_score    = _mean(all_confs)

    # Overall = average of the three displayed sub-scores (Communication, Technical, Confidence)
    overall_score       = round((communication_score + technical_score + confidence_score) / 3, 1)
    structure_score     = _mean([nr["depth"] for nr in normalised_results])

    return {
        "overall_score":       overall_score,
        "placement_readiness": data.get("placement_readiness", "needs_work"),
        "summary":             data.get("summary",       ""),
        "top_strength":        data.get("top_strength",  ""),
        "top_weakness":        data.get("top_weakness",  ""),
        "recommendations":     data.get("recommendations", []),
        "scores": {
            "overall":       overall_score,
            "hr":            hr_score,
            "technical":     technical_score,
            "communication": communication_score,
            "confidence":    confidence_score,
            "structure":     structure_score,
        },
        "question_results": normalised_results,
    }


# ---------------------------------------------------------------------------
# FUNCTION 3: generate_live_question — conversational follow-up
# ---------------------------------------------------------------------------

def generate_live_question(
    resume_context: str,
    conversation_history: list,
    interview_type: str = "Mixed",
    question_number: int = 1,
    total_questions: int = 8,
) -> dict:
    """
    Generate the NEXT interview question based on full conversation history.
    Returns dict: {"question_text": str, "category": str}
    """
    convo_lines = []
    for entry in conversation_history:
        role = entry.get("role", "unknown")
        text = entry.get("text", "")
        if role == "interviewer":
            convo_lines.append(f"I: {text}")
        else:
            convo_lines.append(f"C: {text}")

    convo_text = "\n".join(convo_lines[-10:]) if convo_lines else "(First question — ask a warm intro.)"

    prompt = f"""You are conducting a live voice interview. Interview type: {interview_type}. This is question {question_number} of {total_questions}.

CANDIDATE RESUME:
{resume_context[:1200]}

CONVERSATION SO FAR:
{convo_text}

Generate your NEXT response. It MUST:
1. Start with a very brief, natural conversational acknowledgment of the candidate's last answer (e.g., "That makes sense.", "Got it.", "I understand. Let's move on."). If the candidate asked to skip, acknowledge it (e.g., "Sure, let's skip that.").
2. Follow up with exactly ONE new question related to their resume or experience.
3. Be a COMPLETE sentence ending with a question mark.
4. Be conversational, natural, and brief (15-30 words total).

Return ONLY this JSON object:
{{"question_text": "your brief transition, followed by your complete question here?", "category": "{interview_type.lower() if interview_type != 'Mixed' else 'technical'}"}}"""

    system = "Return ONLY valid JSON. The question_text MUST be a complete sentence ending with '?'. No markdown."

    import re as _re

    def _clean_question(text: str) -> str:
        """Ensure question ends with '?' — Gemini often omits it."""
        text = text.strip().rstrip('.,;:!')
        if not text.endswith('?'):
            text += '?'
        return text

    def _is_complete(text: str) -> bool:
        """Reject questions that look truncated mid-sentence."""
        text = text.strip()
        if len(text) < 15:
            return False
        # Truncated questions often end with prepositions, articles, or conjunctions
        truncation_endings = [
            ' the', ' a', ' an', ' of', ' in', ' to', ' for', ' with',
            ' and', ' or', ' but', ' that', ' which', ' how', ' what',
            ' your', ' you', ' do', ' is', ' are', ' was', ' were',
            ' have', ' has', ' can', ' will', ' would', ' should',
            ' at', ' on', ' by', ' from', ' into', ' about',
        ]
        # Check the text WITHOUT the auto-appended '?'
        raw = text.rstrip('?').strip().lower()
        for ending in truncation_endings:
            if raw.endswith(ending):
                return False
        return True

    for attempt in range(3):
        raw = _call_gemini(prompt, system, max_output_tokens=1024, temperature=0.7)
        cleaned = raw.strip()

        # Try regex extraction first — most reliable
        q_match = _re.search(r'"question_text"\s*:\s*"([^"]{12,})"', cleaned)
        cat_match = _re.search(r'"category"\s*:\s*"([^"]+)"', cleaned)
        if q_match:
            q_text = _clean_question(q_match.group(1))
            cat = cat_match.group(1).strip().lower() if cat_match else "general"
            if _is_complete(q_text):
                return {"question_text": q_text, "category": cat}

        # Fallback: try full JSON parse
        try:
            # Try to close truncated JSON
            if not cleaned.endswith("}"):
                cleaned = cleaned.rstrip(',') + '"}'
            data = _parse_json(cleaned, context="live question generation")
            if isinstance(data, dict) and data.get("question_text"):
                q = _clean_question(str(data["question_text"]))
                if _is_complete(q):
                    return {
                        "question_text": q,
                        "category": str(data.get("category", "general")).strip().lower(),
                    }
        except ValueError:
            pass

        if attempt < 2:
            logger.warning(f"Live Q gen attempt {attempt+1} failed (raw={cleaned[:200]}), retrying")
            if attempt == 0:
                # Retry with a simpler, more direct prompt
                prompt = f"Ask ONE complete interview question about these skills: {resume_context[:400]}. The question MUST be a full sentence ending with a question mark. Return ONLY: {{\"question_text\":\"your complete question here?\",\"category\":\"technical\"}}"
            else:
                # Third attempt — very simple
                prompt = f"Generate a single {interview_type} interview question. Return JSON: {{\"question_text\":\"complete question?\",\"category\":\"general\"}}"
            continue

    # Ultimate fallback — never crash the interview
    fallbacks = [
        "Can you walk me through your most challenging project?",
        "What technical skills do you consider your strongest?",
        "Tell me about a time you solved a difficult problem at work?",
        "What motivates you to pursue this career path?",
        "How do you approach learning new technologies?",
    ]
    import random
    return {
        "question_text": random.choice(fallbacks),
        "category": "behavioral",
    }


# ---------------------------------------------------------------------------
# FUNCTION 4: evaluate_live_interview — holistic eval for live mode
# ---------------------------------------------------------------------------

def evaluate_live_interview(transcript_pairs: list) -> dict:
    """
    Evaluate a live interview transcript. Accepts list of dicts:
    [{"questionText": str, "answerText": str, "questionType": str}, ...]

    Returns the same structure as evaluate_interview().
    """
    return evaluate_interview(transcript_pairs)

"""
Gemini Resume Parsing Service
Uses google-generativeai SDK (same as the rest of the project).
Single model: gemini-2.5-flash — confirmed working with the project API keys.

Only responsibility: parse raw resume text into structured JSON.
"""

import json
import logging
import re

import google.generativeai as genai
from django.conf import settings

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"


class GeminiService:
    """
    Service class for Gemini AI resume parsing.
    Uses the same key rotation pool as services.openai_service.
    """

    def __init__(self):
        """Initialise using the shared key pool."""
        try:
            from services.openai_service import _API_KEYS, _current_key_idx, _configure
            self._api_keys  = _API_KEYS
            self._key_idx   = _current_key_idx
            self._configure = _configure
        except Exception:
            raw = (
                getattr(settings, "GEMINI_API_KEYS", None)
                or getattr(settings, "GEMINI_API_KEY", "")
            )
            if isinstance(raw, (list, tuple)):
                self._api_keys = [k.strip() for k in raw if k.strip().startswith("AIzaSy")]
            else:
                self._api_keys = [k.strip() for k in str(raw).split(",") if k.strip().startswith("AIzaSy")]
            if not self._api_keys:
                raise ValueError("No valid GEMINI_API_KEY found.")
            self._key_idx   = 0
            self._configure = lambda idx: genai.configure(api_key=self._api_keys[idx])

        self._configure(self._key_idx)

    def _get_model(self) -> genai.GenerativeModel:
        return genai.GenerativeModel(MODEL_NAME)

    def _rotate_key(self):
        self._key_idx = (self._key_idx + 1) % len(self._api_keys)
        self._configure(self._key_idx)

    def _call(self, prompt: str) -> str:
        """Call Gemini with key rotation on quota errors. Returns response text."""
        last_error = None
        for _ in range(len(self._api_keys)):
            try:
                model = self._get_model()
                response = model.generate_content(prompt)
                return (response.text or "").strip()
            except Exception as e:
                last_error = e
                err = str(e)
                if any(t in err for t in ("429", "quota", "RATE_LIMIT", "API_KEY_INVALID", "API key expired", "RESOURCE_EXHAUSTED")):
                    self._rotate_key()
                    continue
                raise
        raise RuntimeError(f"All {len(self._api_keys)} keys failed. Last: {last_error}")

    def parse_resume_with_ai(self, raw_text: str) -> dict:
        """
        Parse raw resume text and return a structured dict with:
          skills, experience, education, projects, summary
        """
        text = raw_text[:3000].strip()
        if not text:
            raise ValueError("Empty résumé text — nothing to parse.")

        prompt = f"""Extract structured information from this résumé text.

RÉSUMÉ:
{text}

Return ONLY this exact JSON structure — no prose, no markdown, no backticks:
{{
  "skills":     ["skill1", "skill2"],
  "experience": [{{"title": "Job Title", "company": "Company Name", "duration": "2022-2024"}}],
  "education":  [{{"degree": "B.Tech Computer Science", "institution": "University Name", "year": "2023"}}],
  "projects":   [{{"name": "Project Name", "description": "one-line description", "technologies": ["React", "Node.js"]}}],
  "summary":    "2-3 sentence professional summary of the candidate"
}}

Rules:
- Extract ONLY what is explicitly written in the résumé.
- If a section is absent, return an empty list [] or empty string "".
- Do NOT invent information.
- Return ONLY valid JSON — nothing else."""

        try:
            raw_response = self._call(prompt)
        except Exception as e:
            # Try using the shared _call_gemini as a last resort
            try:
                from services.openai_service import _call_gemini
                raw_response = _call_gemini(
                    prompt=prompt,
                    system="You are a precise résumé parser. Return ONLY valid JSON.",
                    max_output_tokens=1500,
                    temperature=0.1,
                )
            except Exception as inner_e:
                raise RuntimeError(f"Resume AI parsing failed: {e}") from inner_e

        parsed = self._extract_json(raw_response)
        return {
            "skills":     self._ensure_str_list(parsed.get("skills",     [])),
            "experience": self._ensure_dict_list(parsed.get("experience", [])),
            "education":  self._ensure_dict_list(parsed.get("education",  [])),
            "projects":   self._ensure_dict_list(parsed.get("projects",   [])),
            "summary":    str(parsed.get("summary", "")).strip(),
        }

    # ── Helpers ────────────────────────────────────────────────────────────

    def _extract_json(self, raw: str) -> dict:
        """Multi-strategy JSON extraction."""
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned).strip()
        start = cleaned.find("{")
        end   = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start: end + 1]
        try:
            data = json.loads(cleaned)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        try:
            data = json.loads(raw.strip())
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        raise ValueError(
            f"Gemini resume parse returned unparseable JSON. "
            f"Raw response (first 300 chars): {raw[:300]}"
        )

    @staticmethod
    def _ensure_str_list(value) -> list:
        if not isinstance(value, list):
            return []
        return [str(v).strip() for v in value if v and str(v).strip()]

    @staticmethod
    def _ensure_dict_list(value) -> list:
        if not isinstance(value, list):
            return []
        return [v for v in value if isinstance(v, dict)]

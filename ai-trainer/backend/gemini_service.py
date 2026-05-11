# apps/interview/services/gemini_service.py
# Add this method to your existing GeminiService class
# (keep all existing methods, just add generate_next_question below)

import google.generativeai as genai
import json
import re
from django.conf import settings


class GeminiService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel('gemini-2.5-flash')

    # ──────────────────────────────────────────────────────────────────────────
    # CONVERSATIONAL INTERVIEW — core method
    # Called after EVERY answer. Returns the next question based on context.
    # ──────────────────────────────────────────────────────────────────────────
    def generate_next_question(
        self,
        resume_context: str,
        conversation_history: list,   # [{role: "interviewer"|"candidate", text: "..."}]
        interview_type: str,
        question_number: int,         # 1-based, current question number being generated
        total_questions: int = 8,
    ) -> dict:
        """
        Returns:
            {
                "question_text": "...",
                "category": "technical|hr|behavioral|follow_up",
                "is_last": True/False,
                "rationale": "why this question was chosen (internal, not shown to user)"
            }
        """

        # Build conversation transcript for Gemini
        transcript_lines = []
        for turn in conversation_history:
            role = "Interviewer" if turn["role"] == "interviewer" else "Candidate"
            transcript_lines.append(f"{role}: {turn['text']}")
        transcript = "\n".join(transcript_lines) if transcript_lines else "Interview just started."

        questions_remaining = total_questions - question_number + 1
        is_first_question   = question_number == 1
        is_last_question    = question_number >= total_questions

        if is_first_question:
            opening_instruction = """
This is the FIRST question. Start with a warm, natural opener like 
"Tell me about yourself" or "Walk me through your background." 
Keep it broad so the candidate can set the direction.
"""
        elif is_last_question:
            opening_instruction = f"""
This is the FINAL question ({question_number} of {total_questions}).
Make it a closing question: ask about their goals, how they handle failure, 
or give them a chance to elaborate on something they mentioned earlier.
End on a positive, reflective note.
"""
        else:
            opening_instruction = f"""
This is question {question_number} of {total_questions} ({questions_remaining - 1} more after this).
IMPORTANT: You MUST adapt to what the candidate just said.
- If they mentioned a project, tool, or concept → dig deeper into it
- If their answer was vague → ask for a specific example
- If they mentioned something interesting → follow up on it
- If this topic is exhausted → smoothly pivot to a new relevant area
DO NOT ask a generic question. Make it feel like a real human interviewer who was listening.
"""

        # Interview type guidance
        type_guidance = {
            'HR':         "Focus on: personality, culture fit, communication, goals, teamwork",
            'Technical':  "Focus on: coding, system design, algorithms, their specific tech stack from resume",
            'Behavioral': "Focus on: STAR-method situations, past experiences, conflict resolution",
            'Mixed':      "Mix HR, Technical, and Behavioral. Naturally flow between them based on answers.",
        }.get(interview_type, "Balance HR and Technical questions naturally.")

        prompt = f"""You are an expert interviewer at a top Indian IT company conducting a live mock placement interview.
You are interviewing a candidate for a software engineering role.

CANDIDATE RESUME CONTEXT:
{resume_context}

INTERVIEW TYPE: {interview_type}
FOCUS AREAS: {type_guidance}

CONVERSATION SO FAR:
{transcript}

YOUR TASK:
{opening_instruction}

Generate exactly ONE interview question for question number {question_number}.

RULES:
1. The question must feel like natural spoken conversation — not overly formal
2. Maximum 2 sentences. Keep it concise. Real interviewers don't ramble.
3. If the candidate mentioned a specific technology/project, reference it by name
4. Never repeat a question already asked above
5. Category must be one of: hr, technical, behavioral, follow_up
6. follow_up = directly probing something the candidate just said

Return ONLY this JSON (no markdown, no backticks, no extra text):
{{
  "question_text": "Your single interview question here.",
  "category": "hr|technical|behavioral|follow_up",
  "is_last": {str(is_last_question).lower()},
  "rationale": "One sentence explaining why you chose this question."
}}"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.7,       # some creativity but consistent
                    max_output_tokens=300, # short responses — it's just one question
                )
            )
            raw = response.text.strip()
            # Strip accidental markdown fences
            raw = re.sub(r'```(?:json)?', '', raw).strip().rstrip('`').strip()
            result = json.loads(raw)

            # Validate
            if not result.get('question_text'):
                raise ValueError("Empty question_text in response")

            result['is_last']  = is_last_question
            result['category'] = result.get('category', 'general')
            return result

        except (json.JSONDecodeError, ValueError) as e:
            # Fallback: return a safe generic question
            fallback_questions = [
                "Can you walk me through a challenging project you've worked on?",
                "Tell me more about your experience with the technologies you mentioned.",
                "Can you give me a specific example of that from your work?",
                "How did you handle that situation? What was the outcome?",
                "Where do you see yourself in the next few years in this field?",
            ]
            fallback_idx = min(question_number - 1, len(fallback_questions) - 1)
            return {
                "question_text": fallback_questions[fallback_idx],
                "category": "general",
                "is_last": is_last_question,
                "rationale": f"Fallback due to parse error: {str(e)}"
            }

    # ──────────────────────────────────────────────────────────────────────────
    # HOLISTIC EVALUATION — called once at session end with full conversation
    # ──────────────────────────────────────────────────────────────────────────
    def evaluate_full_interview(self, answers: list) -> dict:
        """
        answers: [{questionId, questionText, questionType, answerText}]
        Returns full evaluation JSON.
        """
        transcript_parts = []
        for i, a in enumerate(answers, 1):
            q_type = a.get('questionType', 'general').upper()
            transcript_parts.append(
                f"Q{i} [{q_type}]: {a.get('questionText', '')}\n"
                f"Answer: {a.get('answerText', '[No answer]')}"
            )
        transcript = "\n\n".join(transcript_parts)

        prompt = f"""You are an unbiased expert HR evaluator and technical interviewer at a top Indian IT company.
Evaluate this complete mock interview session holistically. Consider all answers together.
Return ONLY valid JSON. No text before or after. No markdown.
All scores: 0.0 to 10.0 (one decimal place).

--- INTERVIEW TRANSCRIPT ---
{transcript}
--- END ---

Return this exact JSON structure:
{{
  "overall_score": 7.2,
  "placement_readiness": "Almost Ready",
  "summary": "4-5 sentence holistic assessment of the candidate.",
  "top_strength": "One sentence on their biggest strength.",
  "top_weakness": "One sentence on their biggest gap.",
  "recommendations": [
    "Specific action item 1",
    "Specific action item 2",
    "Specific action item 3"
  ],
  "scores": {{
    "hr": 6.5,
    "technical": 8.0,
    "communication": 7.0,
    "confidence": 6.8,
    "structure": 7.3
  }},
  "question_results": [
    {{
      "questionId": "...",
      "content_score": 7.0,
      "communication_score": 8.0,
      "relevance_score": 7.5,
      "overall_q_score": 7.5,
      "feedback": "2-3 sentences of specific, actionable feedback.",
      "strength": "One specific thing done well.",
      "improvement": "One specific thing to improve."
    }}
  ]
}}

Readiness scale:
"Not Ready" = 0-3.9
"Needs Work" = 4.0-5.4  
"Almost Ready" = 5.5-6.9
"Ready" = 7.0-8.4
"Exceptional" = 8.5-10"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=3000,
                )
            )
            raw = response.text.strip()
            raw = re.sub(r'```(?:json)?', '', raw).strip().rstrip('`').strip()
            return json.loads(raw)
        except Exception as e:
            return {
                "overall_score": 0,
                "placement_readiness": "Error",
                "summary": f"Evaluation failed: {str(e)}",
                "top_strength": "N/A",
                "top_weakness": "N/A",
                "recommendations": [],
                "scores": {"hr": 0, "technical": 0, "communication": 0, "confidence": 0, "structure": 0},
                "question_results": []
            }

    # ──────────────────────────────────────────────────────────────────────────
    # Keep your existing methods below (generate_question, evaluate_answer, etc.)
    # ──────────────────────────────────────────────────────────────────────────

"""
Gemini AI Service

Handles all interactions with Google Gemini API for:
- Generating interview questions
- Evaluating user answers
- Providing feedback
"""

import google.generativeai as genai
from django.conf import settings
import json
import logging
import re
import os

logger = logging.getLogger(__name__)


class GeminiService:
    """
    Service class for Google Gemini AI interactions.
    Uses the shared key rotation pool from services.openai_service.
    """

    def __init__(self):
        """Initialize Gemini using the shared key rotation pool."""
        try:
            # Use the same pool as openai_service — avoids duplicate key reading
            from services.openai_service import _get_api_keys, _configure_next_key
            self._api_keys    = _get_api_keys()
            self._key_idx     = 0
            self._configure   = _configure_next_key
        except Exception:
            # Fallback: read keys directly if the import fails
            raw = getattr(settings, 'GEMINI_API_KEYS', None) or getattr(settings, 'GEMINI_API_KEY', '')
            if isinstance(raw, (list, tuple)):
                self._api_keys = [k.strip() for k in raw if k.strip() and k.strip().startswith('AIzaSy')]
            else:
                self._api_keys = [k.strip() for k in str(raw).split(',') if k.strip().startswith('AIzaSy')]
            if not self._api_keys:
                raise ValueError("No valid GEMINI_API_KEY found. Keys must start with 'AIzaSy'.")
            self._key_idx = 0
            self._configure = None

        self._init_model()

    def _init_model(self):
        """Configure the SDK with current key and create model instance."""
        key = self._api_keys[self._key_idx]
        genai.configure(api_key=key)
        self.model = genai.GenerativeModel('gemini-2.5-flash')

    def _rotate_key(self):
        """Switch to next key on 429 quota hit."""
        self._key_idx = (self._key_idx + 1) % len(self._api_keys)
        self._init_model()
        return self._key_idx

    def _call_with_rotation(self, prompt: str) -> str:
        """Call Gemini with automatic key rotation on 429. Returns response text."""
        last_error = None
        for _ in range(len(self._api_keys)):
            try:
                response = self.model.generate_content(prompt)
                return response.text.strip()
            except Exception as e:
                last_error = e
                err = str(e)
                if '429' in err or 'quota' in err.lower() or 'RATE_LIMIT' in err or 'API_KEY_INVALID' in err:
                    self._rotate_key()
                    continue
                raise
        raise RuntimeError(f"All {len(self._api_keys)} keys failed. Last: {last_error}")

    def generate_interview_question(
        self,
        interview_type: str,
        question_number: int,
        total_questions: int,
        resume_context: str = "",
        previous_questions: list = None,
        difficulty_level: str = "beginner"
    ) -> dict:
        """
        Generate an interview question based on context.
        
        Args:
            interview_type: Type of interview (HR, Technical, Behavioral, Mixed)
            question_number: Current question number (1-indexed)
            total_questions: Total questions in session
            resume_context: Parsed resume information
            previous_questions: List of previously asked questions
            difficulty_level: beginner/intermediate/advanced (beginner = 1-liner questions)
            
        Returns:
            dict with question_text, category, difficulty, expected_points
        """
        previous_questions = previous_questions or []
        previous_qs_text = "\n".join([f"- {q}" for q in previous_questions]) if previous_questions else "None"
        
        # Adjust question length based on difficulty
        question_format_instruction = ""
        if difficulty_level == "beginner":
            question_format_instruction = """IMPORTANT: Keep the question SHORT and SIMPLE - ONE LINE ONLY (under 15 words).
Beginner questions should be direct and easy to understand.
Example: "What programming language are you most comfortable with?"""
        elif difficulty_level == "intermediate":
            question_format_instruction = "Questions can be 1-2 sentences with moderate complexity."
        else:
            question_format_instruction = "Questions can be more detailed and challenging."
        
        prompt = f"""You are an experienced {interview_type} interviewer conducting a job interview.

CONTEXT:
- This is question {question_number} of {total_questions}
- Interview type: {interview_type}
- Difficulty level: {difficulty_level}
- Candidate's resume/background: {resume_context if resume_context else 'Not provided'}

PREVIOUSLY ASKED QUESTIONS (do not repeat):
{previous_qs_text}

QUESTION FORMAT:
{question_format_instruction}

INSTRUCTIONS:
1. Generate a relevant, professional interview question
2. For Technical interviews: Focus on practical skills, problem-solving, coding concepts
3. For HR interviews: Focus on career goals, work style, company fit
4. For Behavioral interviews: Use STAR method questions (Situation, Task, Action, Result)
5. For Mixed: Combine different types appropriately
6. If resume is provided, make questions relevant to their background

RESPONSE FORMAT (JSON only, no markdown):
{{
    "question_text": "Your interview question here",
    "category": "technical|behavioral|situational|problem_solving|communication|teamwork|introduction",
    "difficulty": 1-5 (1=easy, 5=hard),
    "expected_points": ["key point 1", "key point 2", "key point 3"],
    "suggested_time_seconds": 60-180
}}

Generate the question now:"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Clean up response - remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = re.sub(r'^```json?\n?', '', response_text)
                response_text = re.sub(r'\n?```$', '', response_text)
            
            result = json.loads(response_text)
            
            # Validate required fields
            required_fields = ['question_text', 'category', 'difficulty', 'expected_points']
            for field in required_fields:
                if field not in result:
                    raise ValueError(f"Missing field: {field}")
                    
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response: {response_text}")
            # Return a default question
            return {
                "question_text": self._get_fallback_question(interview_type, question_number),
                "category": "general",
                "difficulty": 3,
                "expected_points": ["Clear communication", "Relevant examples", "Structured response"],
                "suggested_time_seconds": 120
            }
        except Exception as e:
            logger.error(f"Gemini API error: {str(e)}")
            raise

    def evaluate_answer(
        self,
        question: str,
        answer: str,
        expected_points: list = None,
        interview_type: str = "Technical"
    ) -> dict:
        """
        Evaluate a user's answer using AI.
        
        Args:
            question: The interview question asked
            answer: User's answer text
            expected_points: Key points expected in the answer
            interview_type: Type of interview
            
        Returns:
            dict with score, feedback, strengths, improvements
        """
        expected_points = expected_points or []
        expected_text = "\n".join([f"- {p}" for p in expected_points]) if expected_points else "General interview answer"
        
        prompt = f"""You are a STRICT and HONEST interview evaluator. Your job is to give DIRECT, CONSTRUCTIVE criticism.

IMPORTANT EVALUATION RULES:
- Be HONEST and DIRECT - do not sugarcoat poor answers
- Focus on REAL improvements, not generic praise
- If the answer is weak, say so clearly
- Point out specific gaps and missing elements
- Avoid phrases like "good effort" or "nice try" - be professional and direct
- Harsh but helpful feedback is better than polite but useless feedback

QUESTION ASKED:
"{question}"

CANDIDATE'S ANSWER:
"{answer}"

EXPECTED KEY POINTS:
{expected_text}

INTERVIEW TYPE: {interview_type}

EVALUATION CRITERIA:
1. Relevance (0-100): Does the answer actually address the question? (Be strict - off-topic = low score)
2. Clarity (0-100): Is it clear and structured? (Rambling = low score)
3. Depth (0-100): Does it show real knowledge? (Shallow/generic = low score)
4. Overall Score (0-100): Weighted average - be strict, 70+ should be genuinely good

FEEDBACK STYLE:
- Be direct: "Your answer lacks X" not "You could consider adding X"
- Be specific: Point to exact gaps, not vague improvements
- Be helpful: Tell them exactly what to do differently

RESPONSE FORMAT (JSON only, no markdown):
{{
    "score": 0-100,
    "relevance_score": 0-100,
    "clarity_score": 0-100,
    "depth_score": 0-100,
    "ai_feedback": "2-3 sentences of DIRECT, SPECIFIC feedback - what was wrong and how to fix it",
    "strengths": ["only list GENUINE strengths, leave empty if none"],
    "improvements": ["specific actionable improvement 1", "specific actionable improvement 2"],
    "key_points_covered": ["point covered 1"],
    "key_points_missed": ["point missed 1"]
}}

Evaluate the answer now:"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Clean up response
            if response_text.startswith('```'):
                response_text = re.sub(r'^```json?\n?', '', response_text)
                response_text = re.sub(r'\n?```$', '', response_text)
            
            result = json.loads(response_text)
            
            # Ensure score is within bounds
            result['score'] = max(0, min(100, result.get('score', 50)))
            
            return result
            
        except Exception as e:
            logger.error(f"Answer evaluation error: {str(e)}")
            # Return default evaluation
            return {
                "score": 50,
                "relevance_score": 50,
                "clarity_score": 50,
                "depth_score": 50,
                "ai_feedback": "Thank you for your response. Continue practicing for better results.",
                "strengths": ["Attempted to answer the question"],
                "improvements": ["Provide more specific examples", "Structure your response better"],
                "key_points_covered": [],
                "key_points_missed": expected_points
            }

    def generate_session_feedback(
        self,
        session_data: dict,
        questions_and_answers: list
    ) -> dict:
        """
        Generate comprehensive feedback for a completed interview session.
        
        Args:
            session_data: Interview session information
            questions_and_answers: List of {question, answer, score} dicts
            
        Returns:
            dict with overall_summary, rating, strengths, weaknesses, suggestions
        """
        qa_text = ""
        total_score = 0
        for i, qa in enumerate(questions_and_answers, 1):
            qa_text += f"\nQ{i}: {qa.get('question', 'N/A')}\n"
            qa_text += f"A{i}: {qa.get('answer', 'N/A')}\n"
            qa_text += f"Score: {qa.get('score', 0)}/100\n"
            total_score += qa.get('score', 0)
        
        avg_score = total_score / len(questions_and_answers) if questions_and_answers else 0
        
        prompt = f"""You are an expert career coach providing interview feedback.

INTERVIEW SUMMARY:
- Type: {session_data.get('interview_type', 'General')}
- Questions Answered: {len(questions_and_answers)}
- Average Score: {avg_score:.1f}/100

QUESTIONS AND ANSWERS:
{qa_text}

PROVIDE COMPREHENSIVE FEEDBACK:

RESPONSE FORMAT (JSON only, no markdown):
{{
    "overall_summary": "3-4 sentence summary of performance",
    "overall_rating": "excellent|good|average|needs_improvement|poor",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "weaknesses": ["weakness 1", "weakness 2"],
    "suggestions": ["actionable suggestion 1", "actionable suggestion 2", "actionable suggestion 3"],
    "topic_scores": {{
        "communication": 0-100,
        "technical_knowledge": 0-100,
        "problem_solving": 0-100,
        "confidence": 0-100
    }},
    "recommended_resources": ["resource 1", "resource 2"],
    "practice_areas": ["area to practice 1", "area to practice 2"]
}}

Generate the feedback now:"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            if response_text.startswith('```'):
                response_text = re.sub(r'^```json?\n?', '', response_text)
                response_text = re.sub(r'\n?```$', '', response_text)
            
            result = json.loads(response_text)
            return result
            
        except Exception as e:
            logger.error(f"Session feedback generation error: {str(e)}")
            rating = 'good' if avg_score >= 70 else 'average' if avg_score >= 50 else 'needs_improvement'
            return {
                "overall_summary": f"You completed the interview with an average score of {avg_score:.1f}. Keep practicing to improve.",
                "overall_rating": rating,
                "strengths": ["Completed all questions", "Showed effort in responses"],
                "weaknesses": ["Room for more detailed answers"],
                "suggestions": ["Practice with more mock interviews", "Prepare STAR method examples"],
                "topic_scores": {
                    "communication": avg_score,
                    "technical_knowledge": avg_score,
                    "problem_solving": avg_score,
                    "confidence": avg_score
                },
                "recommended_resources": ["Interview preparation guides", "STAR method tutorials"],
                "practice_areas": ["Technical concepts", "Behavioral questions"]
            }

    def parse_resume_with_ai(self, resume_text: str) -> dict:
        """
        Use AI to extract structured information from resume text.
        
        Args:
            resume_text: Raw text extracted from resume PDF
            
        Returns:
            dict with skills, experience, education, projects, summary
        """
        prompt = f"""Analyze this resume and extract key information.

RESUME TEXT:
{resume_text[:4000]}  # Limit to prevent token overflow

EXTRACT INFORMATION:

RESPONSE FORMAT (JSON only, no markdown):
{{
    "skills": ["skill1", "skill2", "skill3"],
    "experience": [
        {{"title": "Job Title", "company": "Company Name", "duration": "X years", "highlights": ["highlight1"]}}
    ],
    "education": [
        {{"degree": "Degree Name", "institution": "University", "year": "Year"}}
    ],
    "projects": [
        {{"name": "Project Name", "description": "Brief description", "technologies": ["tech1"]}}
    ],
    "summary": "2-3 sentence professional summary of the candidate"
}}

Parse the resume now:"""

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            if response_text.startswith('```'):
                response_text = re.sub(r'^```json?\n?', '', response_text)
                response_text = re.sub(r'\n?```$', '', response_text)
            
            result = json.loads(response_text)
            return result
            
        except Exception as e:
            logger.error(f"Resume parsing error: {str(e)}")
            return {
                "skills": [],
                "experience": [],
                "education": [],
                "projects": [],
                "summary": "Resume information could not be fully parsed."
            }

    def _get_fallback_question(self, interview_type: str, question_number: int) -> str:
        """Return a fallback question if AI generation fails."""
        fallback_questions = {
            "HR": [
                "Tell me about yourself and your career journey.",
                "What motivates you in your professional life?",
                "Where do you see yourself in 5 years?",
                "What are your greatest strengths?",
                "Why are you interested in this role?"
            ],
            "Technical": [
                "Describe a challenging technical problem you've solved recently.",
                "What programming languages are you most comfortable with and why?",
                "How do you approach debugging a complex issue?",
                "Explain a project you're proud of and your role in it.",
                "How do you stay updated with new technologies?"
            ],
            "Behavioral": [
                "Tell me about a time you faced a conflict at work.",
                "Describe a situation where you had to meet a tight deadline.",
                "Give an example of when you showed leadership.",
                "Tell me about a time you failed and what you learned.",
                "Describe a situation where you had to adapt to change."
            ],
            "Mixed": [
                "Tell me about yourself and your technical background.",
                "Describe a challenging project and how you overcame obstacles.",
                "How do you handle disagreements with team members?",
                "What technical skills are you currently developing?",
                "Where do you see your career heading?"
            ]
        }
        
        questions = fallback_questions.get(interview_type, fallback_questions["Mixed"])
        idx = min(question_number - 1, len(questions) - 1)
        return questions[idx]

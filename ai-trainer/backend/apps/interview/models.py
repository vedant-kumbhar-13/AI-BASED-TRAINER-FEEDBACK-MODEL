"""
Interview Module Models

Database schema for AI Interview sessions, questions, answers, and feedback.
"""

from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
import uuid


class Resume(models.Model):
    """
    Stores uploaded resume data and parsed information.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='resumes'
    )
    file = models.FileField(upload_to='resumes/', null=True, blank=True)
    filename = models.CharField(max_length=255, blank=True)
    
    # Parsed content
    raw_text = models.TextField(blank=True, help_text="Full extracted text from resume")
    skills = models.JSONField(default=list, help_text="List of extracted skills")
    experience = models.JSONField(default=list, help_text="Work experience entries")
    education = models.JSONField(default=list, help_text="Education entries")
    projects = models.JSONField(default=list, help_text="Project details")
    summary = models.TextField(blank=True, help_text="AI-generated resume summary")
    
    # Metadata
    is_parsed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'interview_resume'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username}'s Resume - {self.filename}"


class InterviewSession(models.Model):
    """
    Represents a complete interview session.
    """
    INTERVIEW_TYPES = [
        ('HR', 'HR Interview'),
        ('Technical', 'Technical Interview'),
        ('Behavioral', 'Behavioral Interview'),
        ('Mixed', 'Mixed Interview'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('abandoned', 'Abandoned'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='interview_sessions'
    )
    resume = models.ForeignKey(
        Resume,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='interview_sessions'
    )
    
    # Interview configuration
    interview_type = models.CharField(max_length=20, choices=INTERVIEW_TYPES, default='Technical')
    total_questions = models.PositiveIntegerField(default=5)
    duration_minutes = models.PositiveIntegerField(default=15)
    
    # Session state
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    current_question_index = models.PositiveIntegerField(default=0)
    
    # Timing
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    
    # Scores (updated when session ends)
    overall_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    communication_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    technical_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    confidence_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    # Average score for HR-type questions within the session
    hr_avg_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'interview_session'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.interview_type} - {self.status}"

    @property
    def is_completed(self):
        return self.status == 'completed'

    @property
    def questions_answered(self):
        return self.questions.filter(answer__isnull=False).count()


class InterviewQuestion(models.Model):
    """
    Individual interview questions within a session.
    """
    DIFFICULTY_CHOICES = [
        (1, 'Easy'),
        (2, 'Medium-Easy'),
        (3, 'Medium'),
        (4, 'Medium-Hard'),
        (5, 'Hard'),
    ]
    
    CATEGORY_CHOICES = [
        ('introduction', 'Introduction'),
        ('technical', 'Technical'),
        ('behavioral', 'Behavioral'),
        ('situational', 'Situational'),
        ('problem_solving', 'Problem Solving'),
        ('communication', 'Communication'),
        ('teamwork', 'Teamwork'),
        ('leadership', 'Leadership'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        InterviewSession,
        on_delete=models.CASCADE,
        related_name='questions'
    )
    
    # Question content
    question_text = models.TextField()
    question_number = models.PositiveIntegerField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='technical')
    difficulty = models.PositiveIntegerField(choices=DIFFICULTY_CHOICES, default=3)
    
    # Context used to generate this question
    context_used = models.TextField(blank=True, help_text="Resume context used for question generation")
    
    # Expected answer hints (for evaluation)
    expected_points = models.JSONField(default=list, help_text="Key points expected in a good answer")
    suggested_time_seconds = models.PositiveIntegerField(default=120)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'interview_question'
        ordering = ['question_number']
        unique_together = ['session', 'question_number']

    def __str__(self):
        return f"Q{self.question_number}: {self.question_text[:50]}..."


class InterviewAnswer(models.Model):
    """
    User's answer to an interview question with AI feedback.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.OneToOneField(
        InterviewQuestion,
        on_delete=models.CASCADE,
        related_name='answer'
    )
    
    # User's response
    answer_text = models.TextField()
    answer_duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    
    # AI Evaluation
    score = models.FloatField(
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    ai_feedback = models.TextField(help_text="Detailed AI feedback on the answer")
    
    # Structured feedback
    strengths = models.JSONField(default=list, help_text="List of strengths identified")
    improvements = models.JSONField(default=list, help_text="Areas for improvement")
    key_points_covered = models.JSONField(default=list, help_text="Expected points that were covered")
    key_points_missed = models.JSONField(default=list, help_text="Expected points that were missed")
    
    # Scores breakdown
    relevance_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    clarity_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    depth_score = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'interview_answer'

    def __str__(self):
        return f"Answer to Q{self.question.question_number} - Score: {self.score}"


class InterviewFeedback(models.Model):
    """
    Overall feedback for a completed interview session.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(
        InterviewSession,
        on_delete=models.CASCADE,
        related_name='feedback'
    )
    
    # Overall assessment
    overall_summary = models.TextField(help_text="AI-generated summary of interview performance")
    overall_rating = models.CharField(
        max_length=20,
        choices=[
            ('excellent', 'Excellent'),
            ('good', 'Good'),
            ('average', 'Average'),
            ('needs_improvement', 'Needs Improvement'),
            ('poor', 'Poor'),
        ],
        default='average'
    )
    
    # Detailed feedback
    strengths = models.JSONField(default=list, help_text="Overall strengths identified")
    weaknesses = models.JSONField(default=list, help_text="Areas needing improvement")
    suggestions = models.JSONField(default=list, help_text="Actionable improvement suggestions")
    
    # Topic-wise analysis
    topic_scores = models.JSONField(default=dict, help_text="Scores per topic/category")
    
    # Comparison metrics
    percentile = models.FloatField(
        null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Performance percentile compared to other users"
    )
    
    # Resources
    recommended_resources = models.JSONField(default=list, help_text="Learning resources to improve")
    practice_areas = models.JSONField(default=list, help_text="Topics to practice more")
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'interview_feedback'

    def __str__(self):
        return f"Feedback for {self.session.user.username} - {self.overall_rating}"


class EvaluationResult(models.Model):
    """
    Holistic AI evaluation result for a completed interview session.
    Generated by a SINGLE Gemini call from the /submit-all/ endpoint
    using all Q&A pairs at once (fixes BUG-04).
    """
    PLACEMENT_READINESS_CHOICES = [
        ('not_ready',       'Not Ready'),
        ('needs_work',      'Needs Work'),
        ('almost_ready',    'Almost Ready'),
        ('ready',           'Ready'),
        ('highly_ready',    'Highly Ready'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.OneToOneField(
        InterviewSession,
        on_delete=models.CASCADE,
        related_name='evaluation'
    )

    # Timestamp + model metadata
    evaluated_at = models.DateTimeField(auto_now_add=True)
    model_used   = models.CharField(
        max_length=50,
        default='gemini-2.5-flash',
        help_text="Gemini model used for this evaluation"
    )

    # Score breakdown (0–100 each)
    overall_score       = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    hr_score            = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    technical_score     = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    communication_score = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    confidence_score    = models.FloatField(validators=[MinValueValidator(0), MaxValueValidator(100)])
    structure_score     = models.FloatField(
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="How well the candidate structured their answers"
    )

    # Narrative feedback
    summary_feedback = models.TextField(
        help_text="4-5 sentence holistic assessment from Gemini"
    )
    top_strength  = models.CharField(
        max_length=400,
        help_text="Single biggest strength observed across the session"
    )
    top_weakness  = models.CharField(
        max_length=400,
        help_text="Single most important area to improve"
    )

    # Stored as a JSON string: ["Rec 1", "Rec 2", "Rec 3"]
    top_3_recommendations = models.TextField(
        help_text="JSON array of three actionable next-step recommendations"
    )

    # Placement readiness label
    placement_readiness = models.CharField(
        max_length=30,
        choices=PLACEMENT_READINESS_CHOICES,
        default='needs_work'
    )

    # Cached PDF report file
    report_pdf = models.FileField(
        upload_to='reports/',
        null=True, blank=True,
        help_text="Cached PDF report generated by reportlab"
    )

    class Meta:
        db_table = 'interview_evaluation_result'

    def __str__(self):
        return (
            f"Evaluation [{self.session.user.username}] — "
            f"{self.overall_score:.1f}/100 — {self.placement_readiness}"
        )

    def get_recommendations(self):
        """Deserialise top_3_recommendations from JSON string to Python list."""
        import json
        try:
            return json.loads(self.top_3_recommendations)
        except (json.JSONDecodeError, TypeError):
            return []

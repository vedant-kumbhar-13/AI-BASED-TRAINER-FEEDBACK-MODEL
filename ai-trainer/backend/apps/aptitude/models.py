"""
Aptitude Module Models
─────────────────────
AptitudeTopic    — A quiz topic (e.g. "Percentage", "Number Series")
AptitudeQuestion — A multiple-choice question belonging to a topic

Questions are randomised per-attempt using ORDER BY RANDOM() in the view.
"""

from django.db import models


class AptitudeTopic(models.Model):
    """A single aptitude quiz topic."""

    CATEGORY_CHOICES = [
        ('quantitative', 'Quantitative Aptitude'),
        ('data_interpretation', 'Data Interpretation'),
        ('logical_reasoning', 'Logical Reasoning'),
        ('verbal_ability', 'Verbal Ability'),
        ('computer_aptitude', 'Computer Aptitude'),
        ('general_aptitude', 'General Aptitude'),
    ]

    LEVEL_CHOICES = [
        ('Beginner', 'Beginner'),
        ('Intermediate', 'Intermediate'),
        ('Advanced', 'Advanced'),
    ]

    name           = models.CharField(max_length=200, unique=True)
    category       = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='quantitative')
    category_label = models.CharField(max_length=100, default='Quantitative Aptitude')
    icon           = models.CharField(max_length=10, default='📘')
    level          = models.CharField(max_length=20, choices=LEVEL_CHOICES, default='Beginner')
    has_quiz       = models.BooleanField(default=True)
    definition     = models.CharField(max_length=500, blank=True, default='')
    description    = models.TextField(blank=True, default='')
    order          = models.PositiveIntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Aptitude Topic'
        verbose_name_plural = 'Aptitude Topics'

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"

    @property
    def question_count(self):
        return self.questions.count()


class AptitudeQuestion(models.Model):
    """A single multiple-choice aptitude question."""

    topic          = models.ForeignKey(AptitudeTopic, on_delete=models.CASCADE, related_name='questions')
    text           = models.TextField()
    option_a       = models.CharField(max_length=300)
    option_b       = models.CharField(max_length=300)
    option_c       = models.CharField(max_length=300)
    option_d       = models.CharField(max_length=300)
    correct_answer = models.CharField(max_length=300)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        verbose_name = 'Aptitude Question'
        verbose_name_plural = 'Aptitude Questions'

    def __str__(self):
        return f"Q{self.id}: {self.text[:60]}…"

    @property
    def options(self):
        return [self.option_a, self.option_b, self.option_c, self.option_d]

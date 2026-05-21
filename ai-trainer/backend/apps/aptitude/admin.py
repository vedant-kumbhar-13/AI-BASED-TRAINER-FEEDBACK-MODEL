"""
Aptitude Admin
──────────────
AptitudeTopicAdmin with:
  • ModelForm that validates the topic name on every Save (Layer 2 guard)
  • Inline question editor
  • save_model hook that auto-creates / updates a matching learning.Topic
    so the topic immediately appears on the Learning page (/learning) too.
"""

import re
import logging
from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError
from .models import AptitudeTopic, AptitudeQuestion

logger = logging.getLogger(__name__)


# ── Topic name validator ─────────────────────────────────────────────────────

def _validate_aptitude_name(value: str):
    """
    Raises ValidationError if 'value' is not a plausible aptitude topic name.
    Called both from the ModelForm (admin Save) and from admin_views (AI buttons).
    """
    from .admin_views import _validate_topic_name
    error = _validate_topic_name(value.strip())
    if error:
        raise ValidationError(
            f"{error}  "
            "Valid examples: Percentage, Time and Work, Blood Relations, "
            "Logical Reasoning, Bar Graphs, Number System."
        )


class AptitudeTopicForm(forms.ModelForm):
    """ModelForm that validates the topic name before any save."""

    class Meta:
        model  = AptitudeTopic
        fields = '__all__'
        help_texts = {
            'name': (
                '⚠️  Enter a real aptitude / reasoning subject name. '
                'Examples: <em>Percentage</em>, <em>Time and Work</em>, '
                '<em>Blood Relations</em>, <em>Bar Graphs</em>. '
                'Personal names or random words will be rejected here AND '
                'by the AI Generator buttons.'
            ),
        }

    def clean_name(self):
        value = self.cleaned_data.get('name', '').strip()
        _validate_aptitude_name(value)
        return value


# ── Category key mapping ─────────────────────────────────────────
# AptitudeTopic.category values map 1-to-1 to learning.Topic.category
# Both models share the same key strings, so no translation needed.
# But learning.Topic also has some extra categories (arithmetic, algebra…)
# We keep the key as-is; if it doesn't exist in learning.Topic.CATEGORY_CHOICES
# it will default gracefully.

# ── learning.Topic category set (for validation) ─────────────────
LEARNING_CATEGORIES = {
    'arithmetic', 'number_system', 'algebra', 'geometry', 'modern_maths',
    'time_speed_work', 'data_interpretation', 'logical_reasoning',
    'verbal_ability', 'computer_aptitude', 'general_aptitude', 'quantitative',
}


class QuestionInline(admin.TabularInline):
    """Add/edit questions directly inside the topic page."""
    model = AptitudeQuestion
    extra = 3
    fields = ('text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer')
    verbose_name = 'Question'
    verbose_name_plural = 'Questions'


@admin.register(AptitudeTopic)
class AptitudeTopicAdmin(admin.ModelAdmin):
    form = AptitudeTopicForm   # ← validates name on every Save

    list_display = ('name', 'category', 'level', 'question_count', 'has_quiz', 'order', 'synced_to_learning')
    list_filter  = ('category', 'level')
    search_fields = ('name',)
    list_editable = ('order', 'has_quiz')
    ordering      = ('order', 'name')
    list_per_page = 30

    fieldsets = (
        ('⚠️  Topic Name Rules', {
            'fields': (),
            'description': (
                '<div style="background:#1e293b;border:1px solid #f59e0b;border-radius:8px;'
                'padding:14px 18px;margin-bottom:6px;font-size:13px;line-height:1.8;color:#f1f5f9;">'
                '<span style="font-size:15px;font-weight:700;color:#fbbf24;">📋 Before you add a topic — read this:</span><br>'
                '• The <strong style="color:#fff;">Name</strong> field must be a real aptitude or reasoning subject.<br>'
                '• Examples: '
                '<code style="background:#334155;padding:1px 6px;border-radius:4px;color:#7dd3fc;">Percentage</code>, '
                '<code style="background:#334155;padding:1px 6px;border-radius:4px;color:#7dd3fc;">Time and Work</code>, '
                '<code style="background:#334155;padding:1px 6px;border-radius:4px;color:#7dd3fc;">Blood Relations</code>, '
                '<code style="background:#334155;padding:1px 6px;border-radius:4px;color:#7dd3fc;">Logical Reasoning</code>.<br>'
                '• <strong style="color:#f87171;">⛔ Do NOT enter personal names, test words, or random text.</strong> '
                'The AI Generator searches YouTube and Gemini using this name exactly as typed.<br>'
                '• Single-word names must be a known subject '
                '(<code style="background:#334155;padding:1px 6px;border-radius:4px;color:#7dd3fc;">Probability</code>, '
                '<code style="background:#334155;padding:1px 6px;border-radius:4px;color:#7dd3fc;">Averages</code>). '
                'Unknown single words are blocked.<br>'
                '• The Save button will reject invalid names with a clear inline error.'
                '</div>'
            ),
        }),
        ('Topic', {
            'fields': ('name', 'category', 'level', 'icon', 'order', 'has_quiz'),
        }),
        ('Content', {
            'fields': ('definition', 'description'),
            'description': (
                'Definition = one-liner (max 500 chars). '
                'Description = full HTML tutorial. '
                'Use the AI Generator panel above to auto-fill both.'
            ),
        }),
    )

    inlines = [QuestionInline]

    # ── List column helpers ──────────────────────────────────────

    def question_count(self, obj):
        return obj.question_count
    question_count.short_description = 'Questions'

    def synced_to_learning(self, obj):
        """Shows whether a matching learning.Topic exists."""
        try:
            from apps.learning.models import Topic
            exists = Topic.objects.filter(name=obj.name).exists()
            from django.utils.html import format_html
            if exists:
                return format_html('<span style="color:#16a34a;font-weight:600;">✓ Synced</span>')
            return format_html('<span style="color:#dc2626;">✗ Not synced</span>')
        except Exception:
            return '—'
    synced_to_learning.short_description = 'Learning Page'

    # ── Auto-sync to learning.Topic on every save ────────────────

    def save_model(self, request, obj, form, change):
        """Save AptitudeTopic then mirror it to learning.Topic."""
        super().save_model(request, obj, form, change)
        self._sync_to_learning(obj)

    def _sync_to_learning(self, apt_topic: AptitudeTopic):
        """
        Create or update a learning.Topic record that mirrors this AptitudeTopic.
        This makes the topic visible on /learning immediately after saving.

        Sync rules:
          • name, icon, level, definition, description  → copied directly
          • category → use same key if valid, else 'quantitative'
          • has_quiz  → set True (since it came from aptitude quiz admin)
          • is_archived → False (make it visible on the learning page)
          • slug → auto-generated by learning.Topic.save()
        """
        try:
            from apps.learning.models import Topic

            # Resolve category — use the aptitude category if learning.Topic supports it
            cat = apt_topic.category if apt_topic.category in LEARNING_CATEGORIES else 'quantitative'

            defaults = {
                'category':    cat,
                'icon':        apt_topic.icon or '📘',
                'level':       apt_topic.level or 'Beginner',
                'definition':  apt_topic.definition or '',
                'description': apt_topic.description or '',
                'has_quiz':    True,
                'is_archived': False,
                'order':       apt_topic.order,
            }

            topic, created = Topic.objects.update_or_create(
                name=apt_topic.name,
                defaults=defaults,
            )

            action = 'Created' if created else 'Updated'
            logger.info(
                "[AptitudeAdmin] %s learning.Topic '%s' (id=%s, category=%s)",
                action, topic.name, topic.id, topic.category,
            )

        except Exception as e:
            logger.error(
                "[AptitudeAdmin] Failed to sync '%s' to learning.Topic: %s",
                apt_topic.name, e,
            )

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from django.db.models import Avg
from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(BaseUserAdmin):
    """User list showing name, email, and average interview score."""

    list_display = ('username', 'email', 'first_name', 'last_name', 'avg_score', 'date_joined')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('-date_joined',)
    list_per_page = 25
    list_filter = ()          # Remove all sidebar filters — keep it clean
    inlines = []              # No inline sections

    # Only show the most relevant fieldsets
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'email')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
    )

    def avg_score(self, obj):
        """Average overall score across all completed interview sessions."""
        try:
            result = (
                obj.interview_sessions
                .filter(status='completed', overall_score__isnull=False)
                .aggregate(avg=Avg('overall_score'))
            )
            val = result.get('avg')
            if val is not None:
                if val >= 70:
                    color, bg = '#166534', '#dcfce7'
                elif val >= 40:
                    color, bg = '#92400e', '#fef9c3'
                else:
                    color, bg = '#991b1b', '#fee2e2'
                return format_html(
                    '<span style="color:{};background:{};padding:2px 10px;border-radius:20px;'
                    'font-weight:600;font-size:0.82rem;">{:.0f}%</span>',
                    color, bg, val
                )
            return format_html('<span style="color:#999;">—</span>')
        except Exception:
            return '—'

    avg_score.short_description = 'Avg Interview Score'
    avg_score.admin_order_field = None

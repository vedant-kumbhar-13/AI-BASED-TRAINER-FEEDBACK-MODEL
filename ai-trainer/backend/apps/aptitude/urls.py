from django.urls import path
from . import views
from . import admin_views

urlpatterns = [
    # ── Student-facing endpoints ──
    path('topics/', views.list_topics, name='aptitude-topics'),
    path('questions/', views.get_questions, name='aptitude-questions'),
    path('submit/', views.submit_quiz, name='aptitude-submit'),
    path('history/', views.get_history, name='aptitude-history'),

    # ── Admin-only AI generation endpoints (staff_member_required) ──
    path('admin/generate-description/', admin_views.generate_description, name='aptitude-admin-gen-desc'),
    path('admin/generate-questions/', admin_views.generate_questions, name='aptitude-admin-gen-q'),
    path('admin/generate-videos/', admin_views.generate_videos, name='aptitude-admin-gen-vid'),
    path('admin/save-generated/', admin_views.save_generated, name='aptitude-admin-save'),
]

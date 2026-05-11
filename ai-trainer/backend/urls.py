# apps/interview/urls.py
# Add the new /chat/ URL to your existing urlpatterns

from django.urls import path
from . import views

urlpatterns = [
    # ── Existing endpoints (keep these) ──────────────────────────────────────
    path('resume/',                  views.resume_list_create,    name='resume-list'),
    path('resume/<uuid:pk>/',        views.resume_detail,         name='resume-detail'),
    path('resume/<uuid:pk>/summary/',views.resume_summary,        name='resume-summary'),
    path('history/',                 views.interview_history,     name='interview-history'),
    path('stats/',                   views.interview_stats,       name='interview-stats'),
    path('feedback/<uuid:pk>/',      views.interview_feedback,    name='interview-feedback'),
    path('transcribe/',              views.transcribe_audio,      name='transcribe'),

    # ── Updated start (now generates only 1st question) ──────────────────────
    path('start/',                   views.start_interview,       name='interview-start'),

    # ── NEW: Real-time conversational chat ────────────────────────────────────
    # POST after every answer → returns next AI question based on conversation
    path('chat/',                    views.interview_chat,        name='interview-chat'),

    # ── NEW: Submit all for holistic evaluation ───────────────────────────────
    path('submit-all/',              views.submit_all_answers,    name='submit-all'),

    # ── Keep old submit-answer for backward compat ───────────────────────────
    path('submit-answer/',           views.submit_answer,         name='submit-answer'),
    path('end/<uuid:pk>/',           views.end_interview,         name='interview-end'),
    path('<uuid:pk>/',               views.interview_detail,      name='interview-detail'),
]

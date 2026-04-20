from django.urls import path
from . import views

urlpatterns = [
    path('topics/', views.list_topics, name='aptitude-topics'),
    path('questions/', views.get_questions, name='aptitude-questions'),
    path('submit/', views.submit_quiz, name='aptitude-submit'),
]

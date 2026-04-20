from django.contrib import admin
from .models import AptitudeTopic, AptitudeQuestion


@admin.register(AptitudeTopic)
class AptitudeTopicAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'level', 'icon', 'has_quiz', 'question_count')
    list_filter = ('category', 'level', 'has_quiz')
    search_fields = ('name',)
    ordering = ('order', 'name')


@admin.register(AptitudeQuestion)
class AptitudeQuestionAdmin(admin.ModelAdmin):
    list_display = ('id', 'topic', 'text_short', 'correct_answer')
    list_filter = ('topic',)
    search_fields = ('text',)
    raw_id_fields = ('topic',)

    def text_short(self, obj):
        return obj.text[:80] + '…' if len(obj.text) > 80 else obj.text
    text_short.short_description = 'Question'

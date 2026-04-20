"""
Management command: seed_aptitude
─────────────────────────────────
Reads the frontend aptitudeData.ts file, parses topics and questions,
and populates the AptitudeTopic / AptitudeQuestion tables.

Usage:
    python manage.py seed_aptitude
    python manage.py seed_aptitude --clear   # wipe + re-seed
"""

import re
import os
from django.conf import settings
from django.core.management.base import BaseCommand
from apps.aptitude.models import AptitudeTopic, AptitudeQuestion


class Command(BaseCommand):
    help = 'Seed aptitude topics and questions from frontend aptitudeData.ts'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true', help='Delete all existing data before seeding')

    def handle(self, *args, **options):
        if options['clear']:
            AptitudeQuestion.objects.all().delete()
            AptitudeTopic.objects.all().delete()
            self.stdout.write(self.style.WARNING('Cleared all existing aptitude data.'))

        # Locate the aptitudeData.ts file
        # settings.BASE_DIR = .../ai-trainer/backend
        # We need           = .../ai-trainer/frontend/src/data/aptitudeData.ts
        ts_path = os.path.join(str(settings.BASE_DIR), '..', 'frontend', 'src', 'data', 'aptitudeData.ts')
        ts_path = os.path.normpath(ts_path)

        if not os.path.exists(ts_path):
            self.stderr.write(self.style.ERROR(f'File not found: {ts_path}'))
            return

        self.stdout.write(f'Reading {ts_path}...')
        with open(ts_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # ── Parse TOPICS ──
        topic_pattern = re.compile(
            r"\{\s*"
            r"id:\s*(\d+)\s*,\s*"
            r"name:\s*['\"](.+?)['\"]\s*,\s*"
            r"category:\s*['\"](.*?)['\"]\s*,\s*"
            r"categoryLabel:\s*['\"](.*?)['\"]\s*,\s*"
            r"hasQuiz:\s*(true|false)\s*,\s*"
            r"definition:\s*['\"](.*?)['\"]\s*,\s*"
            r"description:\s*['\"](.*?)['\"]\s*,\s*"
            r"videoUrl:\s*['\"](.*?)['\"]\s*,\s*"
            r"level:\s*['\"](.*?)['\"]\s*,\s*"
            r"icon:\s*['\"](.*?)['\"]\s*,?\s*"
            r"\}",
            re.DOTALL
        )

        topics_created = 0
        topics_skipped = 0
        topic_id_map = {}  # frontend id -> db topic object

        for m in topic_pattern.finditer(content):
            frontend_id = int(m.group(1))
            name = m.group(2)
            category = m.group(3)
            category_label = m.group(4)
            has_quiz = m.group(5) == 'true'
            definition = m.group(6)
            description = m.group(7)
            level = m.group(9)
            icon = m.group(10)

            topic, created = AptitudeTopic.objects.get_or_create(
                name=name,
                defaults={
                    'category': category,
                    'category_label': category_label,
                    'icon': icon,
                    'level': level,
                    'has_quiz': has_quiz,
                    'definition': definition,
                    'description': description,
                    'order': frontend_id,
                }
            )
            topic_id_map[frontend_id] = topic
            if created:
                topics_created += 1
            else:
                topics_skipped += 1

        self.stdout.write(f'Topics: {topics_created} created, {topics_skipped} already existed.')

        # ── Parse QUESTIONS ──
        # Match patterns like: { id: 1, topicId: 1, text: '...', options: ['a', 'b', 'c', 'd'], correctAnswer: '...' }
        question_pattern = re.compile(
            r"\{\s*id:\s*(\d+)\s*,\s*"
            r"topicId:\s*(\d+)\s*,\s*"
            r"text:\s*'((?:[^'\\]|\\.)*)'\s*,\s*"
            r"options:\s*\[([^\]]+)\]\s*,\s*"
            r"correctAnswer:\s*'((?:[^'\\]|\\.)*)'\s*"
            r"\}",
            re.DOTALL
        )

        questions_created = 0
        questions_skipped = 0
        batch = []

        for m in question_pattern.finditer(content):
            topic_id_frontend = int(m.group(2))
            topic = topic_id_map.get(topic_id_frontend)
            if not topic:
                continue

            text = m.group(3).replace("\\'", "'")
            options_raw = m.group(4)
            correct_answer = m.group(5).replace("\\'", "'")

            # Parse individual options from the array string
            opts = re.findall(r"'((?:[^'\\]|\\.)*)'", options_raw)
            opts = [o.replace("\\'", "'") for o in opts]

            if len(opts) < 4:
                continue

            # Check if question text already exists for this topic
            if AptitudeQuestion.objects.filter(topic=topic, text=text).exists():
                questions_skipped += 1
                continue

            batch.append(AptitudeQuestion(
                topic=topic,
                text=text,
                option_a=opts[0],
                option_b=opts[1],
                option_c=opts[2],
                option_d=opts[3],
                correct_answer=correct_answer,
            ))

            if len(batch) >= 200:
                AptitudeQuestion.objects.bulk_create(batch)
                questions_created += len(batch)
                batch = []

        if batch:
            AptitudeQuestion.objects.bulk_create(batch)
            questions_created += len(batch)

        self.stdout.write(self.style.SUCCESS(
            f'Done! Questions: {questions_created} created, {questions_skipped} already existed.'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'Total in DB: {AptitudeTopic.objects.count()} topics, {AptitudeQuestion.objects.count()} questions.'
        ))

"""
Common App Configuration
─────────────────────────
Sets the Django Admin site title, header, and index title
so the admin panel is branded as "AI Trainer Admin".
"""

from django.apps import AppConfig
from django.contrib import admin


class CommonConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.common'
    verbose_name = 'Common'

    def ready(self):
        # Admin branding — runs once when Django starts
        admin.site.site_header = 'AI Trainer — Admin Panel'
        admin.site.site_title = 'AI Trainer Admin'
        admin.site.index_title = 'Content Management'

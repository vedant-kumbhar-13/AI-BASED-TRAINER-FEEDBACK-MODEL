"""
URL configuration for ai_trainer project.

API endpoint structure:
- /api/auth/          - Authentication (login, register, token)
- /api/interview/     - AI Interview Module
- /admin/             - Django Admin
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),
    
    # API endpoints
    path('api/auth/', include('apps.accounts.urls')),
    path('api/interview/', include('apps.interview.urls')),
    path('api/learning/', include('apps.learning.urls')),

    # Future modules
    path('api/aptitude/', include('apps.aptitude.urls')),
    # path('api/dashboard/', include('apps.dashboard.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

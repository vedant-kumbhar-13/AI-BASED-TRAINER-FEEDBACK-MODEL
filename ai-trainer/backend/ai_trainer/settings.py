"""
Django settings for ai_trainer project.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/topics/settings/
"""

from pathlib import Path
from datetime import timedelta
from decouple import config, Csv
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# ===========================================
# Security Settings
# ===========================================
SECRET_KEY = config('SECRET_KEY', default='django-insecure-r@jw1!^&#k%)04^gf3-p%nt*ue3tax2yycr#5utsp=m*m*w5rl')
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = ['localhost', '127.0.0.1']


# ===========================================
# Application definition
# ===========================================
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    # Local apps
    'apps.accounts',
    'apps.dashboard',
    'apps.learning',
    'apps.aptitude',
    'apps.interview',
    'apps.common',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Must be first
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'ai_trainer.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'ai_trainer.wsgi.application'


# ===========================================
# Database
# ===========================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# ===========================================
# Password validation
# ===========================================
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ===========================================
# Internationalization
# ===========================================
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# ===========================================
# Static files (CSS, JavaScript, Images)
# ===========================================
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (User uploads)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'


# ===========================================
# Default primary key field type
# ===========================================
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ===========================================
# Custom User Model
# ===========================================
AUTH_USER_MODEL = 'accounts.CustomUser'


# ===========================================
# REST Framework Configuration
# ===========================================
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user': '60/minute',
    },
}


# ===========================================
# JWT Configuration
# ===========================================
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=24),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
}


# ===========================================
# CORS Configuration
# ===========================================
CORS_ALLOWED_ORIGINS = config(
    'ALLOWED_ORIGINS',
    default='http://localhost:5173,http://localhost:5174',
    cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True


# ===========================================
# Gemini AI Configuration
# ===========================================
GEMINI_API_KEY = config('GEMINI_API_KEY', default='')
GEMINI_API_KEYS = config('GEMINI_API_KEYS', default=GEMINI_API_KEY, cast=Csv())

# ── Google Cloud APIs (STT + TTS) ─────────────────────────────────────────
# Path to service-account JSON key file (relative to manage.py directory)
GOOGLE_APPLICATION_CREDENTIALS = config('GOOGLE_APPLICATION_CREDENTIALS', default='')
# Set the env var so Google SDK picks it up automatically
import os as _os
if GOOGLE_APPLICATION_CREDENTIALS:
    _os.environ.setdefault('GOOGLE_APPLICATION_CREDENTIALS', GOOGLE_APPLICATION_CREDENTIALS)
# Project ID for Cloud Speech-to-Text v2 API recognizer path
GOOGLE_CLOUD_PROJECT = config('GOOGLE_CLOUD_PROJECT', default='')


# ===========================================
# YouTube Data API v3 Configuration
# ===========================================
YOUTUBE_API_KEY = config('YOUTUBE_API_KEY', default='')


# ===========================================
# Interview Module Settings
# ===========================================
MAX_INTERVIEW_QUESTIONS = config('MAX_INTERVIEW_QUESTIONS', default=5, cast=int)
INTERVIEW_DURATION_MINUTES = config('INTERVIEW_DURATION_MINUTES', default=15, cast=int)
DEFAULT_INTERVIEW_TYPE = config('DEFAULT_INTERVIEW_TYPE', default='Technical')


# ===========================================
# File Upload Settings
# ===========================================
MAX_RESUME_SIZE_MB = config('MAX_RESUME_SIZE_MB', default=10, cast=int)
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_RESUME_SIZE_MB * 1024 * 1024  # Convert to bytes
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_RESUME_SIZE_MB * 1024 * 1024


# ===========================================
# Logging Configuration
# ===========================================
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'apps.interview': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': True,
        },
    },
}
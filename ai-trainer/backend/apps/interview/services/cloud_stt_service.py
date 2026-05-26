"""
Google Cloud Speech-to-Text v2 — Chirp 2 model.
Receives raw audio bytes (WebM/OGG from MediaRecorder).
Returns transcribed text string.
"""
import os, time, logging
from django.conf import settings
logger = logging.getLogger(__name__)

# I3 fix: region is configurable via Django settings
_REGION = getattr(settings, 'GOOGLE_CLOUD_REGION', 'us-central1')

# ── Module-level credential & client caching (GCS-01 fix) ──────────────────
# Discovering credentials once at import saves ~800ms per transcription call.
_credentials = None
_project_id = None
_CREDENTIALS_OK = False
_client = None

try:
    import google.auth
    _credentials, _project_id = google.auth.default()
    _project_id = (
        getattr(settings, "GOOGLE_CLOUD_PROJECT", "")
        or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
        or _project_id
        or ""
    )
    _CREDENTIALS_OK = bool(_project_id)
    if not _project_id:
        logger.warning("GOOGLE_CLOUD_PROJECT not set — Cloud STT will be unavailable.")
except Exception as e:
    logger.warning("Google Cloud credentials not available at import: %s", e)


def _get_client():
    """Lazy-init and cache the SpeechClient (avoids reconnect overhead per call)."""
    global _client
    if _client is None:
        from google.cloud.speech_v2 import SpeechClient
        from google.api_core.client_options import ClientOptions
        endpoint = f"{_REGION}-speech.googleapis.com"
        _client = SpeechClient(client_options=ClientOptions(api_endpoint=endpoint))
    return _client


def transcribe_audio_bytes(audio_bytes: bytes, language_code: str = "en-IN") -> str:
    # GCS-01 fix: fast-fail if credentials were not found at import time
    if not _CREDENTIALS_OK:
        raise RuntimeError(
            "Google Cloud credentials not configured. "
            "Run 'gcloud auth application-default login' or set GOOGLE_APPLICATION_CREDENTIALS. "
            "Also ensure GOOGLE_CLOUD_PROJECT is set in .env."
        )

    from google.cloud.speech_v2.types import cloud_speech

    client = _get_client()
    config = cloud_speech.RecognitionConfig(
        auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
        language_codes=[language_code],
        model="chirp_2",
        # GCS-01 fix: enable automatic punctuation for cleaner transcripts
        features=cloud_speech.RecognitionFeatures(
            enable_automatic_punctuation=True,
        ),
    )
    request = cloud_speech.RecognizeRequest(
        recognizer=f"projects/{_project_id}/locations/{_REGION}/recognizers/_",
        config=config, content=audio_bytes,
    )

    # E1 fix: exponential backoff retry for transient errors (503, 429, network)
    last_error = None
    for attempt in range(3):
        try:
            response = client.recognize(request=request)
            parts = [r.alternatives[0].transcript for r in response.results if r.alternatives]
            return " ".join(parts).strip()
        except Exception as e:
            last_error = e
            err_str = str(e)
            # GCS-01 fix: non-retryable errors — fail immediately with actionable message
            if any(tag in err_str for tag in ("404", "NOT_FOUND")):
                raise RuntimeError(
                    f"Google Cloud Speech-to-Text v2 API is not enabled for this project. "
                    f"Enable it at: https://console.cloud.google.com/apis/library/speech.googleapis.com "
                    f"Also verify GOOGLE_CLOUD_PROJECT={_project_id} and GOOGLE_CLOUD_REGION={_REGION} "
                    f"match your GCP project."
                ) from e
            if any(tag in err_str for tag in ("403", "PERMISSION_DENIED")):
                raise RuntimeError(
                    f"Service account lacks Speech-to-Text permissions. "
                    f"Grant the 'Cloud Speech Client' role (roles/speech.client) to your service account."
                ) from e
            # Only retry on transient / quota errors
            if any(tag in err_str for tag in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "Deadline")):
                wait = 0.5 * (2 ** attempt)
                logger.warning("Cloud STT attempt %d failed (transient), retrying in %.1fs: %s", attempt + 1, wait, err_str[:120])
                time.sleep(wait)
                continue
            # Non-transient error — fail immediately
            logger.error("Cloud STT failed: %s", e)
            raise RuntimeError(f"Speech-to-text failed: {e}") from e

    logger.error("Cloud STT failed after 3 retries: %s", last_error)
    raise RuntimeError(f"Speech-to-text failed after retries: {last_error}") from last_error

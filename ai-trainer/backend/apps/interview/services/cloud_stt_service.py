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

def transcribe_audio_bytes(audio_bytes: bytes, language_code: str = "en-IN") -> str:
    # Graceful credential check — clear error instead of cryptic SDK exception
    if not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS') and not os.environ.get('GOOGLE_CLOUD_PROJECT'):
        raise RuntimeError(
            "Google Cloud credentials not configured. "
            "Set GOOGLE_APPLICATION_CREDENTIALS in your .env file, "
            "or switch to Web Speech API mode (browser-based, no credentials needed)."
        )

    from google.cloud.speech_v2 import SpeechClient
    from google.cloud.speech_v2.types import cloud_speech
    from google.api_core.client_options import ClientOptions
    project_id = getattr(settings, "GOOGLE_CLOUD_PROJECT", "") or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    if not project_id:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT not set in .env")

    endpoint = f"{_REGION}-speech.googleapis.com"
    client = SpeechClient(client_options=ClientOptions(api_endpoint=endpoint))
    config = cloud_speech.RecognitionConfig(
        auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
        language_codes=[language_code],
        model="chirp_2",
    )
    request = cloud_speech.RecognizeRequest(
        recognizer=f"projects/{project_id}/locations/{_REGION}/recognizers/_",
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

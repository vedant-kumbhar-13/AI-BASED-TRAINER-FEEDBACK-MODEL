"""
Google Cloud Speech-to-Text v2 — Chirp 2 model.
Receives raw audio bytes (WebM/OGG from MediaRecorder).
Returns transcribed text string.
"""
import os, logging
from django.conf import settings
logger = logging.getLogger(__name__)

def transcribe_audio_bytes(audio_bytes: bytes, language_code: str = "en-IN") -> str:
    from google.cloud.speech_v2 import SpeechClient
    from google.cloud.speech_v2.types import cloud_speech
    from google.api_core.client_options import ClientOptions
    project_id = getattr(settings, "GOOGLE_CLOUD_PROJECT", "") or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    if not project_id:
        raise RuntimeError("GOOGLE_CLOUD_PROJECT not set in .env")
    client = SpeechClient(client_options=ClientOptions(api_endpoint="us-central1-speech.googleapis.com"))
    config = cloud_speech.RecognitionConfig(
        auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
        language_codes=[language_code],
        model="chirp_2",
    )
    request = cloud_speech.RecognizeRequest(
        recognizer=f"projects/{project_id}/locations/us-central1/recognizers/_",
        config=config, content=audio_bytes,
    )
    try:
        response = client.recognize(request=request)
    except Exception as e:
        logger.error("Cloud STT failed: %s", e)
        raise RuntimeError(f"Speech-to-text failed: {e}") from e
    parts = [r.alternatives[0].transcript for r in response.results if r.alternatives]
    return " ".join(parts).strip()

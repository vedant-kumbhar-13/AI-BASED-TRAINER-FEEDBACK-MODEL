"""
Google Cloud Text-to-Speech — Chirp 3 HD voice (en-IN).
Returns MP3 audio bytes for a given text string.
Caches in Django cache (default: 1 hour) to avoid duplicate API calls.
"""
import hashlib, logging
from google.cloud import texttospeech
from django.core.cache import cache
logger = logging.getLogger(__name__)

VOICE_NAME = "en-IN-Chirp3-HD-Aoede"   # Natural Indian English voice
CACHE_TIMEOUT = 3600                    # 1 hour in seconds

def synthesize_speech(text: str, voice_name: str = VOICE_NAME) -> bytes:
    """Return MP3 audio bytes for text. Cached by (text, voice_name)."""
    cache_key = "tts_" + hashlib.md5(f"{voice_name}:{text}".encode()).hexdigest()
    cached = cache.get(cache_key)
    if cached:
        logger.debug("TTS cache hit for text: %s...", text[:40])
        return cached
    client = texttospeech.TextToSpeechClient()
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice = texttospeech.VoiceSelectionParams(
        language_code="en-IN",
        name=voice_name,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=0.92,   # Slightly slower — clear interview pace
        pitch=0.0,
    )
    try:
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )
    except Exception as e:
        logger.error("Cloud TTS failed: %s", e)
        raise RuntimeError(f"Text-to-speech failed: {e}") from e
    audio_bytes = response.audio_content
    cache.set(cache_key, audio_bytes, CACHE_TIMEOUT)
    logger.info("TTS synthesized %d chars -> %d bytes MP3", len(text), len(audio_bytes))
    return audio_bytes

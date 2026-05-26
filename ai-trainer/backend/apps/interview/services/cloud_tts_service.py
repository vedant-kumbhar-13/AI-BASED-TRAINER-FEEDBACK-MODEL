"""
Google Cloud Text-to-Speech — Chirp 3 HD voice (en-IN).
Returns MP3 audio bytes for a given text string.
Caches in Django cache (default: 1 hour) to avoid duplicate API calls.
"""
import hashlib, logging
from google.cloud import texttospeech
from django.core.cache import cache
logger = logging.getLogger(__name__)

# E2 fix: ordered fallback voice list
VOICE_FALLBACKS = [
    "en-IN-Chirp3-HD-Aoede",   # Primary: natural Indian English voice
    "en-IN-Standard-A",         # Fallback 1: standard Indian English
    "en-US-Standard-B",         # Fallback 2: US English standard
]
CACHE_TIMEOUT = 3600                    # 1 hour in seconds

# ── Module-level credential & client caching (GCS-02 fix) ──────────────────
# Avoids ~400ms connection setup overhead on every API call.
_CREDENTIALS_OK = False
_client = None

try:
    import google.auth
    google.auth.default()
    _CREDENTIALS_OK = True
except Exception as e:
    logger.warning("Google Cloud credentials not available at import: %s", e)


def _get_client():
    """Lazy-init and cache the TextToSpeechClient (GCS-02 fix)."""
    global _client
    if _client is None:
        _client = texttospeech.TextToSpeechClient()
    return _client


def synthesize_speech(text: str, voice_name: str | None = None) -> bytes:
    """Return MP3 audio bytes for text. Cached by (text, voice_name).
    
    Tries each voice in VOICE_FALLBACKS if the primary voice fails (E2 fix).
    """
    # GCS-02 fix: fast-fail if credentials were not found at import time
    if not _CREDENTIALS_OK:
        raise RuntimeError(
            "Google Cloud credentials not configured. "
            "Run 'gcloud auth application-default login' or set GOOGLE_APPLICATION_CREDENTIALS."
        )

    voices_to_try = [voice_name] if voice_name else list(VOICE_FALLBACKS)

    # GCS-09 fix: resolve None voice to default BEFORE cache key calculation
    # so that voice_name=None and voice_name="en-IN-Chirp3-HD-Aoede" share
    # the same cache entry.
    effective_voice = voice_name or VOICE_FALLBACKS[0]

    for vname in voices_to_try:
        cache_key = "tts_" + hashlib.md5(f"{effective_voice}:{text}".encode()).hexdigest()
        cached = cache.get(cache_key)
        if cached:
            logger.debug("TTS cache hit for text: %s...", text[:40])
            return cached

        try:
            client = _get_client()
            synthesis_input = texttospeech.SynthesisInput(text=text)
            # Determine language code from voice name
            lang_code = "en-IN" if "en-IN" in vname else "en-US"
            voice = texttospeech.VoiceSelectionParams(
                language_code=lang_code,
                name=vname,
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
                speaking_rate=0.92,   # Slightly slower — clear interview pace
                pitch=0.0,
            )
            response = client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )
            audio_bytes = response.audio_content
            cache.set(cache_key, audio_bytes, CACHE_TIMEOUT)
            logger.info("TTS synthesized %d chars -> %d bytes MP3 (voice=%s)", len(text), len(audio_bytes), vname)
            return audio_bytes
        except Exception as e:
            logger.warning("Cloud TTS voice '%s' failed: %s — trying next", vname, e)
            continue

    raise RuntimeError(f"All TTS voices failed for text: {text[:60]}...")

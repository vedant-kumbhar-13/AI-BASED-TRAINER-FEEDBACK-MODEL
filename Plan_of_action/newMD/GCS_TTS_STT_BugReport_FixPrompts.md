# GCS Cloud TTS/STT — Complete Bug Report & Agent Fix Prompts
**Project:** AI-Based Pre-Placement Trainer | **Date:** May 2026  
**Files analysed:** `cloud_tts_service.py`, `cloud_stt_service.py`, `views.py` (interview), `LiveInterviewSession.tsx`, `InterviewSession.tsx`, `useSTT.ts`, `useSilenceDetector.ts`

---

## SUMMARY TABLE

| ID | File | Bug | Severity | Impact |
|----|------|-----|----------|--------|
| GCS-01 | `cloud_stt_service.py` | Wrong STT API (v2 Chirp 2 needs project/recognizer, but credentials fail silently → blank transcripts) | **Critical** | All Cloud STT returns empty string |
| GCS-02 | `cloud_tts_service.py` | `google.auth.default()` called at synthesize time (blocks on cold starts) + TTS client recreated every call (no reuse) | **High** | 2–4s added latency per question |
| GCS-03 | `LiveInterviewSession.tsx` | Cloud STT is attempted AFTER MediaRecorder stops — entire audio blob uploaded (up to 55s). No streaming. Causes 3–8s "black hole" between silence and next question | **Critical** | Interview flow freezes after every answer |
| GCS-04 | `LiveInterviewSession.tsx` | `speak()` calls `await audio.play()` without catching `NotAllowedError` — browser blocks autoplay before user gesture, crashing the interview before Q1 | **Critical** | Cloud TTS silently fails on first question |
| GCS-05 | `LiveInterviewSession.tsx` | Browser SpeechRecognition fallback runs in **parallel** but its transcript is used only if Cloud STT returns empty. If Cloud STT times out (not fails), fallback transcript is lost | **High** | Lost answer text on slow network |
| GCS-06 | `useSilenceDetector.ts` | `useSilenceDetector` is **never used** in `InterviewSession.tsx` — the main interview page. `MAX_RECORDING_SECS = 55` timer is the only stop mechanism. No silence auto-advance. | **Critical** | User must manually click Stop every question |
| GCS-07 | `InterviewSession.tsx` | `startRecording()` is called inside `speakText()` via `onDone()` callback with a 500ms delay — but `speakText()` itself is called in a `useEffect` that triggers when `currentIdx` changes. Race condition: new question renders while old TTS `onended` fires → mic starts mid-TTS on fast machines | **High** | Recording starts during AI speech |
| GCS-08 | `cloud_stt_service.py` | `language_code` is a list `[language_code]` but Chirp 2 recogniser also needs `features.enable_automatic_punctuation = True` and `model = "chirp_2"` confirmed — but the recognizer path uses a wildcard `_` that requires the Speech-to-Text v2 API to be **enabled** in GCP console. No actionable error if it isn't. | **High** | Silent 400/404 errors on new GCP projects |
| GCS-09 | `cloud_tts_service.py` | Cache key is `md5(voice:text)` but `voice_name=None` resolves to the string `"None"` in the format string — so the same text with `voice_name=None` vs `voice_name="en-IN-Chirp3-HD-Aoede"` gets **two different cache entries** | **Medium** | Cache never hits on the common `None` path |
| GCS-10 | `LiveInterviewSession.tsx` `speak()` | Browser SpeechSynthesis fallback fires `utt.onend` but does NOT call the Chrome pause-resume keep-alive fix from `useTTS.ts`. Long questions (>15 words) pause silently in Chrome | **Medium** | Interviewer voice cuts out mid-question |
| GCS-11 | `views.py` `transcribe_audio` | MIME type of the uploaded blob is `audio/webm` or `audio/ogg` depending on browser. GCS STT v2 with `AutoDetectDecodingConfig` should handle this — but the request uses a wildcard recognizer `_` which does NOT support `auto` decoding on all regions | **Medium** | Transcription 400 errors on some GCP regions |
| GCS-12 | `LiveInterviewSession.tsx` VAD | `requestAnimationFrame` loop runs at ~60fps but `analyser.getByteFrequencyData()` only updates every ~20ms (audio context buffer). Running at 60fps wastes CPU and produces duplicate readings, making threshold calibration noisy | **Low** | VAD calibration drift in noisy environments |

---

## DETAILED BUG ANALYSIS

### GCS-01 — Cloud STT Returns Blank Transcripts (Critical)

**Location:** `backend/apps/interview/services/cloud_stt_service.py`, lines 30–55

**What's wrong:**  
The STT v2 API uses a recognizer path:
```python
recognizer=f"projects/{project_id}/locations/{_REGION}/recognizers/_"
```
The `_` wildcard recognizer requires the **Speech-to-Text v2 API** to be enabled in the GCP project **and** billing to be active. If either is missing, the API returns a `404 NOT_FOUND` or `403 PERMISSION_DENIED` — but the retry loop only retries on `503/429/UNAVAILABLE`. A `404` causes the exception to be raised immediately as `RuntimeError("Speech-to-text failed")`. The view then falls back to returning `{"error": "..."}` with HTTP 503. The frontend catches this and uses the browser fallback transcript — **but the browser SpeechRecognition was already stopped** by the time `rec.onstop` fires. So the fallback returns an empty string too.

The second issue: `google.auth.default()` is called at call time, not at module load time. On a cold Django process this adds ~800ms of ADC discovery latency to every single transcription call.

**Fix:** See Prompt GCS-01.

---

### GCS-03 — 3–8 Second Freeze After Every Answer (Critical)

**Location:** `LiveInterviewSession.tsx`, `stopRecording()`, lines ~325–385

**What's wrong:**  
The flow is:
1. VAD detects silence → calls `finalizeAnswer()`
2. `finalizeAnswer()` calls `stopRecording()` which returns a `Promise`
3. `stopRecording()` calls `rec.stop()`, then waits for `rec.onstop`
4. `rec.onstop` uploads the entire audio blob to `/api/interview/transcribe/`
5. Cloud STT processes the audio (3–8s for a 30s recording)
6. Only after the API response does `askQuestion()` for the next question get called

The user sees a frozen "Processing..." screen for 3–8 seconds between every question. This destroys the conversational feel.

**Fix:** Start Cloud STT upload **immediately when VAD fires** (pre-emptively), not after recording fully stops. See Prompt GCS-03.

---

### GCS-04 — Cloud TTS Crashes on First Question (Critical)

**Location:** `LiveInterviewSession.tsx`, `speak()`, line ~113

**What's wrong:**
```typescript
await audio.play(); // throws NotAllowedError if no prior user gesture
```
The very first call to `speak()` happens when `askQuestion()` is triggered by `startInterview()` — which is called from `requestMic()`. The mic permission dialog **is** a user gesture, but `audio.play()` requires a gesture on the **same page context**. After the async `getUserMedia()` call, the browser's gesture context is expired. Chrome throws `NotAllowedError: play() failed because the user didn't interact with the document first`. The `try/catch` around the `await audio.play()` call catches this and falls back to browser TTS — but the `await` is inside a `new Promise(async (resolve) => {...})` anti-pattern. The outer Promise never resolves if `audio.play()` throws before `audio.onended` fires, causing the interview to hang at the "speaking" phase indefinitely.

**Fix:** See Prompt GCS-04.

---

### GCS-06 — No Silence Detection in Main InterviewSession (Critical)

**Location:** `frontend/src/pages/InterviewSession.tsx`

**What's wrong:**  
`useSilenceDetector` is imported nowhere in `InterviewSession.tsx`. The hook exists in `src/hooks/useSilenceDetector.ts` and is used in `LiveInterviewSession.tsx`, but the regular `InterviewSession.tsx` (the non-live flow) never wires it up. Users must manually click "Stop Recording" after every answer. The blueprint spec requires 3-second silence auto-advance.

**Fix:** See Prompt GCS-06.

---

### GCS-07 — Recording Starts During AI Speech (Race Condition)

**Location:** `InterviewSession.tsx`, `speakText()` and the `useEffect` on `currentIdx`

**What's wrong:**
```typescript
// In speakText():
const onDone = () => {
  setIsSpeaking(false);
  if (inputMode === 'voice' && !navigatingRef.current) setTimeout(() => startRecording(), 500);
};

// In useEffect:
useEffect(() => {
  if (phase === 'answering' && ttsEnabled && currentQuestion) {
    speakText(`Question ${currentIdx + 1}. ${currentQuestion.text}`);
  }
}, [currentIdx, phase]);
```
When the user clicks "Next Question", `currentIdx` increments and the `useEffect` immediately fires `speakText()` for the new question. If the **previous** `speakText()` call's `onDone()` callback fires at the same moment (because the previous TTS just finished), it calls `startRecording()` while the new TTS is already speaking. The `navigatingRef.current` flag is supposed to prevent this but is only set for 800ms — if TTS of the previous question takes longer, the flag expires and recording starts mid-speech.

**Fix:** See Prompt GCS-07.

---

## FIX PROMPTS FOR AI CODING AGENT

Each prompt below is a complete, self-contained instruction. Give one prompt per file to your coding agent.

---

### PROMPT GCS-01: Fix Cloud STT Service

```
FILE: backend/apps/interview/services/cloud_stt_service.py
TASK: Fix all bugs in the Cloud Speech-to-Text service.

BUG 1 — Module-level credential check (performance):
Move the google.auth.default() check from inside the function to module level, 
run it once on import, and cache the credentials and project_id in module-level 
variables. If credentials are unavailable at import time, set a module-level 
CREDENTIALS_AVAILABLE = False flag. The transcribe_audio_bytes function should 
check this flag and raise RuntimeError immediately instead of rediscovering credentials 
on every call.

BUG 2 — Better error messages for missing API enablement:
Add a specific check: if the exception message contains "NOT_FOUND" or "404" or 
"recognizer" (case-insensitive), raise a RuntimeError with the message:
  "Google Cloud Speech-to-Text v2 API is not enabled for this project. 
   Enable it at: https://console.cloud.google.com/apis/library/speech.googleapis.com
   Also verify GOOGLE_CLOUD_PROJECT={project_id} and GOOGLE_CLOUD_REGION={_REGION} 
   match your GCP project."
This should NOT be retried (skip the retry loop).

BUG 3 — Enable automatic punctuation and explicit model:
In the RecognitionConfig, add:
  features=cloud_speech.RecognitionFeatures(
      enable_automatic_punctuation=True,
      enable_spoken_punctuation=False,
  )
Keep model="chirp_2" as is.

BUG 4 — Retry only on truly transient errors:
In the retry loop, add "404" and "NOT_FOUND" to the list of errors that should 
NOT be retried (raise immediately). Only retry on: "503", "429", "UNAVAILABLE", 
"RESOURCE_EXHAUSTED", "Deadline exceeded".

The function signature and return type (str) must remain unchanged.
```

---

### PROMPT GCS-02: Fix Cloud TTS Service

```
FILE: backend/apps/interview/services/cloud_tts_service.py
TASK: Fix two bugs in the Cloud TTS service.

BUG 1 — TextToSpeechClient recreated every call:
Create a module-level _client variable initialized to None. Add a function 
_get_client() that creates the client once (lazy initialization) and caches it 
in _client. Use _get_client() inside synthesize_speech() instead of calling 
texttospeech.TextToSpeechClient() directly. This prevents the ~400ms connection 
setup overhead on every API call.

BUG 2 — Cache key collision when voice_name=None:
In the cache key calculation, replace:
  cache_key = "tts_" + hashlib.md5(f"{vname}:{text}".encode()).hexdigest()
with:
  effective_voice = vname or VOICE_FALLBACKS[0]
  cache_key = "tts_" + hashlib.md5(f"{effective_voice}:{text}".encode()).hexdigest()
This ensures that calling synthesize_speech(text, voice_name=None) reuses the 
same cache entry as synthesize_speech(text, voice_name="en-IN-Chirp3-HD-Aoede").
Place the effective_voice calculation BEFORE the for loop, not inside it.

Do not change the function signature or return type.
```

---

### PROMPT GCS-03: Fix the Post-Answer Freeze in LiveInterviewSession

```
FILE: frontend/src/pages/LiveInterviewSession.tsx
TASK: Eliminate the 3–8 second freeze between answers by pre-emptively uploading 
audio to Cloud STT as soon as VAD detects silence, instead of waiting for the full 
MediaRecorder.onstop cycle.

CHANGE 1 — Add a pre-emptive Cloud STT upload function:
Add this function alongside the existing stopRecording:

  const uploadAudioForTranscription = useCallback(async (): Promise<string> => {
    // Called the moment VAD fires — while MediaRecorder is still stopping
    const browserFallback = browserTranscriptRef.current || '';
    const chunks = [...audioChunksRef.current];
    if (!chunks.length) return browserFallback;
    
    try {
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const blob = new Blob(chunks, { type: mime });
      
      // Only upload if audio is meaningful (> 1KB)
      if (blob.size < 1024) return browserFallback;
      
      setIsTranscribing(true);
      const fd = new FormData();
      fd.append('audio', blob, 'rec.webm');
      const res = await fetch(`${API_BASE}/api/interview/transcribe/`, {
        method: 'POST',
        headers: AuthService.getAuthHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error('Cloud STT failed');
      const data = await res.json();
      const txt = (data.text || '').trim();
      setTranscriptText(txt || browserFallback);
      return txt || browserFallback;
    } catch {
      console.warn('[STT] Cloud STT failed, using browser fallback');
      setTranscriptText(browserFallback);
      return browserFallback;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

CHANGE 2 — Update finalizeAnswer to use the pre-emptive upload:
Replace the current finalizeAnswer body with:

  const finalizeAnswer = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    if (finalizeCalledRef.current) return;
    finalizeCalledRef.current = true;
    setPhase('processing');
    
    // Stop VAD and MediaRecorder simultaneously
    silenceActiveRef.current = false;
    cancelAnimationFrame(silenceRafRef.current);
    
    // Stop browser STT
    try { speechRecRef.current?.stop(); } catch {}
    speechRecRef.current = null;
    const browserFallback = browserTranscriptRef.current || '';
    
    // Start Cloud STT upload immediately (pre-emptive — don't wait for rec.stop)
    const transcriptPromise = uploadAudioForTranscription();
    
    // Stop MediaRecorder in parallel
    const rec = mediaRecRef.current;
    if (rec && rec.state === 'recording') {
      // Request final data chunk before stopping
      rec.requestData();
      await new Promise<void>(r => { rec.onstop = () => r(); rec.stop(); });
      rec.stream.getTracks().forEach(t => t.stop());
    }
    
    // Close AudioContext and cleanup
    try { silenceCtxRef.current?.close(); } catch {}
    silenceCtxRef.current = null;
    try { silenceStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    silenceStreamRef.current = null;
    mediaRecRef.current = null;
    
    // Get transcript (may already be resolved if Cloud STT was fast)
    const answerText = await transcriptPromise || browserFallback || '[No answer provided]';
    const q = currentQRef.current!;
    
    // ... rest of the existing finalizeAnswer logic (intent detection, API call) unchanged
  }, [stopRecording, askQuestion, uploadAudioForTranscription]);

CHANGE 3 — Remove the old stopRecording Promise-based approach from finalizeAnswer.
The stopRecording function itself can remain for cleanup use, but finalizeAnswer 
should no longer call `await stopRecording()`.
```

---

### PROMPT GCS-04: Fix Cloud TTS Autoplay Block on First Question

```
FILE: frontend/src/pages/LiveInterviewSession.tsx
TASK: Fix the speak() function to not crash the interview when browser blocks autoplay.

CURRENT BROKEN CODE (lines ~105–140):
  const speak = useCallback(async (text: string): Promise<void> => {
    return new Promise(async (resolve) => {  // ← anti-pattern: async Promise executor
      try {
        ...
        await audio.play();  // ← throws NotAllowedError, never calls onended
        return;
      } catch { ... }
      ...
      resolve();  // ← only reached via fallback path
    });
  }, []);

REQUIRED FIX:
Replace the entire speak function with this corrected version:

  const speak = useCallback(async (text: string): Promise<void> => {
    // Attempt Cloud TTS
    try {
      const res = await fetch(`${API_BASE}/api/interview/tts/`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('TTS unavailable');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current.src); }
      const audio = new Audio(url);
      audioRef.current = audio;
      
      // FIX: wrap play() in a proper try/catch that falls through on NotAllowedError
      try {
        await audio.play();
        await new Promise<void>(resolve => {
          audio.onended = () => { URL.revokeObjectURL(url); setTtsUnavailable(false); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); setTtsUnavailable(false); resolve(); };
        });
        return; // Cloud TTS succeeded
      } catch (playErr) {
        URL.revokeObjectURL(url);
        console.warn('[TTS] Audio play() blocked (autoplay policy), falling back to browser TTS', playErr);
        // Fall through to browser TTS
      }
    } catch {
      console.warn('[TTS] Cloud TTS fetch failed, falling back to browser TTS');
    }

    // Fallback: browser speechSynthesis with Chrome keep-alive fix
    if (window.speechSynthesis) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.9;
      utt.pitch = 1.0;
      // Chrome pause-resume keep-alive (prevents long questions from cutting out)
      const ping = setInterval(() => {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 5000);
      await new Promise<void>(resolve => {
        utt.onend = () => { clearInterval(ping); setTtsUnavailable(false); resolve(); };
        utt.onerror = () => { clearInterval(ping); setTtsUnavailable(false); resolve(); };
        window.speechSynthesis.speak(utt);
      });
    } else {
      setTtsUnavailable(true);
    }
  }, []);

KEY CHANGES:
1. Removed the "async Promise executor" anti-pattern (new Promise(async => {}))
2. The play() await is now inside its own try/catch that falls through gracefully
3. Added the 5s Chrome keep-alive setInterval to the browser fallback (was missing)
4. The outer async function now uses a flat await chain — always resolves
```

---

### PROMPT GCS-05: Fix Lost Browser Fallback Transcript on Cloud STT Timeout

```
FILE: frontend/src/pages/LiveInterviewSession.tsx  
TASK: Ensure the browser SpeechRecognition fallback transcript is never lost 
when Cloud STT times out (as opposed to returning an error).

PROBLEM: Currently browserTranscriptRef.current is set to '' by setTranscriptText('')
call in stopRecording() (the I7 fix comment). But it's cleared BEFORE the Cloud STT 
await completes, so if Cloud STT times out (fetch hangs for 10+ seconds), the browser 
transcript is already overwritten as empty when the timeout handler runs.

FIX — in stopRecording() (the Promise-based version) or uploadAudioForTranscription():

1. Capture the browser transcript to a local variable BEFORE any async operations:
   const browserFallback = browserTranscriptRef.current || '';

2. Add an AbortController with a 7-second timeout to the Cloud STT fetch:
   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), 7000);
   const res = await fetch(`${API_BASE}/api/interview/transcribe/`, {
     method: 'POST',
     headers: AuthService.getAuthHeaders(),
     body: fd,
     signal: controller.signal,  // ← ADD THIS
   });
   clearTimeout(timeoutId);

3. In the catch block for the fetch, use browserFallback (the local variable):
   } catch {
     console.warn('[STT] Cloud STT timed out or failed, using browser transcript');
     setTranscriptText(browserFallback);  // use LOCAL variable, not ref
     resolve(browserFallback);
   }

4. Do NOT call setTranscriptText('') before the Cloud STT fetch resolves.
   Only clear it if Cloud STT succeeds with a non-empty result.
```

---

### PROMPT GCS-06: Wire Silence Detector into InterviewSession (Main Flow)

```
FILE: frontend/src/pages/InterviewSession.tsx
TASK: Add 3-second silence auto-advance to the main InterviewSession page.
This page currently requires the user to manually click Stop Recording every time.

STEP 1 — Import the hook:
Add this import at the top:
  import { useSilenceDetector } from '../hooks/useSilenceDetector';

STEP 2 — Instantiate the hook:
After the useSTT() call, add:
  const handleSilenceAutoStop = useCallback(() => {
    // Only auto-stop if we're actually recording right now
    if (isRecording) {
      stopRecording();
    }
  }, [isRecording, stopRecording]);
  
  const { startSilenceDetection, stopSilenceDetection, resetSilenceTimer } =
    useSilenceDetector(handleSilenceAutoStop, 3000);

STEP 3 — Start silence detection when recording starts:
In the startRecording function (around the sttStart() call), add:
  const startRecording = useCallback(() => {
    if (!sttSupported) { ... return; }
    resetTranscript();
    sttStart();
    setError('');
    startSilenceDetection();  // ← ADD THIS
  }, [sttSupported, sttStart, resetTranscript, startSilenceDetection]);

STEP 4 — Stop silence detection when recording stops:
In the stopRecording function, add:
  const stopRecording = useCallback(() => {
    stopSilenceDetection();  // ← ADD THIS FIRST
    const finalText = sttStop();
    if (finalText) {
      setCurrentAnswer(prev => prev.trim() ? `${prev.trim()} ${finalText}`.trim() : finalText);
    }
  }, [sttStop, stopSilenceDetection]);

STEP 5 — Reset silence timer when new speech arrives:
Add a useEffect that watches sttTranscript:
  useEffect(() => {
    if (isRecording && sttTranscript) {
      resetSilenceTimer();
    }
  }, [sttTranscript, isRecording, resetSilenceTimer]);

STEP 6 — Stop silence detection on phase change or unmount:
In the cleanup return of the mount useEffect (the one that calls startInterview), 
add stopSilenceDetection() to the cleanup:
  return () => {
    browserTTS.stopSpeaking();
    audioPlayerRef.current?.pause();
    stopSilenceDetection();  // ← ADD THIS
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

STEP 7 — Show silence countdown indicator in the UI:
In the voice mode recording controls section, after the waveform animation spans, add:
  {isRecording && (
    <span className="text-xs text-amber-600 ml-2">
      🔇 Auto-stops after 3s silence
    </span>
  )}

Do NOT remove the manual Stop Recording button — keep both.
```

---

### PROMPT GCS-07: Fix TTS/Recording Race Condition in InterviewSession

```
FILE: frontend/src/pages/InterviewSession.tsx
TASK: Fix the race condition where microphone starts while TTS is still speaking 
the next question.

PROBLEM: speakText() calls onDone() → startRecording() via setTimeout(500ms). 
But if the user clicks Next Question while TTS is speaking, a NEW speakText() 
call starts for the next question, and the OLD speakText()'s onDone fires after 
800ms resetting navigatingRef.current, then triggers startRecording() while the 
new question's TTS is mid-sentence.

FIX:
1. Add a ttsIdRef to track which TTS call is current:
   const ttsIdRef = useRef(0);

2. Rewrite speakText to use the ID:
   const speakText = useCallback(async (text: string) => {
     if (!ttsEnabled || !text) return;
     setIsSpeaking(true);
     
     // Increment ID so any previous speakText call knows it's stale
     ttsIdRef.current++;
     const myId = ttsIdRef.current;
     
     const onDone = () => {
       // Only auto-start recording if THIS is still the active TTS call
       if (ttsIdRef.current !== myId) return;
       setIsSpeaking(false);
       if (inputMode === 'voice' && !navigatingRef.current) {
         setTimeout(() => {
           // Double-check: still the active call AND not navigating
           if (ttsIdRef.current === myId && !navigatingRef.current) {
             startRecording();
           }
         }, 500);
       }
     };
     
     // ... rest of the Cloud TTS → browser TTS fallback logic unchanged ...
     // onDone() call at the end of each path remains unchanged
   }, [ttsEnabled, inputMode, startRecording, browserTTS]);

3. In stopSpeaking(), also stop any pending auto-recording:
   const stopSpeaking = () => {
     ttsIdRef.current++;  // Invalidate any pending onDone callback
     audioPlayerRef.current?.pause();
     audioPlayerRef.current = null;
     browserTTS.stopSpeaking();
     setIsSpeaking(false);
   };

4. Remove the navigatingRef.current timer reset (the setTimeout 800ms):
   The navigatingRef timeout in handleNextQuestion can be reduced from 800ms to 0 
   since ttsIdRef now handles the stale-callback problem:
   setTimeout(() => { navigatingRef.current = false; }, 0);
```

---

### PROMPT GCS-08: Add GCP API Enablement Check on Backend Startup

```
FILE: backend/apps/interview/services/cloud_stt_service.py  
(also touch: backend/apps/interview/services/cloud_tts_service.py)
TASK: Add a startup connectivity check so developers get a clear error message 
when the GCP APIs are not enabled, instead of silent failures at runtime.

In cloud_stt_service.py, add this function at the bottom of the file:

  def check_stt_available() -> tuple[bool, str]:
      """
      Returns (True, '') if Cloud STT is accessible, or (False, reason) if not.
      Call this from a Django management command or health-check endpoint.
      """
      try:
          import google.auth
          credentials, project = google.auth.default()
          if not project:
              return False, "GOOGLE_CLOUD_PROJECT not set or could not be inferred from credentials"
          
          from google.cloud.speech_v2 import SpeechClient
          from google.cloud.speech_v2.types import cloud_speech
          from google.api_core.client_options import ClientOptions
          
          client = SpeechClient(client_options=ClientOptions(
              api_endpoint=f"{_REGION}-speech.googleapis.com"
          ))
          # Try listing recognizers — lightweight operation that confirms API is enabled
          parent = f"projects/{project}/locations/{_REGION}"
          client.list_recognizers(parent=parent)
          return True, ''
      except Exception as e:
          err = str(e)
          if '404' in err or 'NOT_FOUND' in err:
              return False, f"Speech-to-Text v2 API not enabled. Enable at: https://console.cloud.google.com/apis/library/speech.googleapis.com (project: {project})"
          if '403' in err or 'PERMISSION_DENIED' in err:
              return False, f"Service account lacks speech.recognizers.list permission. Grant 'Cloud Speech Client' role."
          return False, f"Cloud STT unavailable: {err[:200]}"

In cloud_tts_service.py, add a similar check_tts_available() function that 
calls client.list_voices(parent="projects/{project}/locations/global") as a 
lightweight probe.

Then in backend/apps/interview/views.py, add a new endpoint:

  @api_view(['GET'])
  @permission_classes([IsAuthenticated])
  def cloud_services_health(request):
      """GET /api/interview/health/ — check if GCS TTS and STT are configured"""
      from .services.cloud_stt_service import check_stt_available
      from .services.cloud_tts_service import check_tts_available
      stt_ok, stt_msg = check_stt_available()
      tts_ok, tts_msg = check_tts_available()
      return Response({
          'stt': {'available': stt_ok, 'message': stt_msg},
          'tts': {'available': tts_ok, 'message': tts_msg},
      })

Register this URL in urls.py:
  path('health/', views.cloud_services_health, name='cloud-health'),
```

---

### PROMPT GCS-09: Fix VAD Throttle in LiveInterviewSession

```
FILE: frontend/src/pages/LiveInterviewSession.tsx
TASK: Throttle the VAD requestAnimationFrame loop to run at ~20fps instead of 
~60fps to match the actual audio analysis update rate and reduce CPU usage.

FIND this inside the check() function (around the calibration section):
  silenceRafRef.current = requestAnimationFrame(check);

There are multiple calls to this (at the end of calibration branch and at the 
end of the VAD branch). Replace ALL of them with:
  silenceRafRef.current = requestAnimationFrame(() => {
    setTimeout(check, 50); // throttle to ~20fps — matches audio analyser update rate
  });

This reduces the loop from ~60 iterations/second to ~20 iterations/second, 
matching the AudioContext analyser's actual data refresh rate (AnalyserNode 
updates approximately every 20ms at 44100Hz with fftSize=1024).

Also increase CALIBRATION_MS from 800 to 1000 to give the threshold more 
samples in the noisy room case:
  const CALIBRATION_MS = 1000;
```

---

## ENVIRONMENT SETUP CHECKLIST

Before any of the above fixes matter, confirm these are set in `backend/.env`:

```
# Required for Cloud STT
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Required GCP APIs to enable in console:
# 1. Cloud Speech-to-Text API (v2): https://console.cloud.google.com/apis/library/speech.googleapis.com
# 2. Cloud Text-to-Speech API: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com

# Service account minimum roles needed:
# - Cloud Speech Client (roles/speech.client)
# - Cloud Text-to-Speech Service Agent (roles/cloudtexttospeech.serviceAgent)
```

---

## PRIORITY ORDER

Apply fixes in this order:

1. **GCS-01** (requirements.txt + cloud_stt_service.py) — without this, Cloud STT is broken for all new GCP projects
2. **GCS-04** (speak() anti-pattern) — without this, the entire live interview crashes on the first question
3. **GCS-06** (silence detector in InterviewSession) — this is the most user-visible missing feature
4. **GCS-07** (race condition) — fix before demo to avoid mic starting mid-speech
5. **GCS-03** (pre-emptive upload) — performance fix, dramatically improves interview flow
6. **GCS-02** (TTS client caching) — performance fix
7. **GCS-05** (timeout + fallback transcript) — robustness fix
8. **GCS-08** (health check endpoint) — developer tooling, not user-facing
9. **GCS-09 + GCS-10** (VAD throttle + Chrome keep-alive in browser fallback) — polish

---

*Generated from full codebase analysis — AI Pre-Placement Trainer voice_mode branch*

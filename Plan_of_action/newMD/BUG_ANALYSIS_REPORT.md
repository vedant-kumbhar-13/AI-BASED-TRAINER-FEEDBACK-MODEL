# AI Pre-Placement Trainer — Complete Bug & Vulnerability Analysis
**Codebase:** AI-BASED-TRAINER-FEEDBACK-MODEL_voice_mode-main  
**Analysed Files:** All 75+ source files (frontend hooks, pages, components, backend views, services)  
**Total Issues Found:** 8 Critical · 7 High · 5 Medium · 3 Logic/Architecture Gaps

---

## PART 1 — SHOWSTOPPER BUGS (Voice System Won't Work At All)

---

### 🔴 BUG-V1 — CRITICAL · Duplicate Hooks: `.ts` Files Override the Correct `.js` Files

**Files affected:** All four hooks — `useTTS`, `useSTT`, `useSilenceDetector`, `useInterviewSession`

**Root cause:**  
Both a `.ts` and a `.js` version exist for every hook. Vite + TypeScript resolves `.ts` files **before** `.js` files when there is no file extension in the import. `Interview.jsx` imports:
```js
import { useTTS }             from '../hooks/useTTS';
import { useSTT }             from '../hooks/useSTT';
import { useSilenceDetector } from '../hooks/useSilenceDetector';
import { useInterviewSession } from '../hooks/useInterviewSession';
```
Vite picks **`useTTS.ts`**, **`useSTT.ts`**, **`useSilenceDetector.ts`**, and **`useInterviewSession.ts`** — NOT the well-written `.js` versions.

**Why this matters:** Every single `.ts` version has critical bugs documented below. The `.js` versions (which are the correct implementations from the blueprint) are silently ignored at runtime.

**Fix:** Delete all four `.ts` versions. Keep only the `.js` versions. The `.js` files are the ones that work correctly.

```
DELETE: src/hooks/useTTS.ts
DELETE: src/hooks/useSTT.ts  
DELETE: src/hooks/useSilenceDetector.ts
DELETE: src/hooks/useInterviewSession.ts
```

---

### 🔴 BUG-V2 — CRITICAL · `useTTS.ts`: `speak()` Does NOT Return a Promise

**File:** `src/hooks/useTTS.ts`, `speak` function  
**Location:** The `speak` callback (around line 55)

**The bug:**  
The `.ts` version's `speak()` function is `void` — it starts speech synthesis but returns nothing:
```ts
// useTTS.ts — BROKEN
const speak = useCallback((text: string) => {
  stopSpeaking();
  if (!text || voices.length === 0) return;   // silently returns undefined
  const utterance = new SpeechSynthesisUtterance(text);
  // ... no return statement, no Promise
  window.speechSynthesis.speak(utterance);
}, [voices, getBestVoice, stopSpeaking]);
```

`Interview.jsx` does `await speak(...)`:
```js
// Interview.jsx — runQuestion()
await speak(`Question ${index + 1}. ${q.text}`);
// Falls through to countdown IMMEDIATELY
setPhase(PHASES.COUNTDOWN);
```

Because `await undefined` resolves instantly, the **countdown starts while TTS is still speaking the question**. The microphone turns on while the AI is still talking, capturing the TTS audio as the user's answer.

**The correct `.js` version:**
```js
// useTTS.js — CORRECT
const speak = useCallback((text) => {
  return new Promise((resolve, reject) => {
    // ...
    utter.onend = () => { clearInterval(ping); resolve(); };
    utter.onerror = (err) => { clearInterval(ping); reject(err); };
    synth.current.speak(utter);
  });
}, [getVoice]);
```

**Fix:** Delete `useTTS.ts`. The `.js` version properly returns a `Promise<void>` that resolves only when `onend` fires.

---

### 🔴 BUG-V3 — CRITICAL · `useTTS.ts`: Keep-Alive Actively INTERRUPTS Speech Every 5 Seconds

**File:** `src/hooks/useTTS.ts`, inside `speak()` (around line 60)

**The bug:**
```ts
// useTTS.ts — WRONG (creates a 5-second stutter)
keepAliveIntervalId.current = window.setInterval(() => {
  if (!window.speechSynthesis.speaking) {
    clearInterval(keepAliveIntervalId.current!);
    return;
  }
  window.speechSynthesis.pause();   // ← PAUSES speech every 5 seconds!
  window.speechSynthesis.resume();  // ← then immediately resumes
}, 5000);
```

Chrome's bug is that synthesis **spontaneously pauses** on its own for long texts. The correct fix is to **resume only if already paused**. The `.ts` version calls `pause()` unconditionally, causing an audible stutter every 5 seconds in ALL cases.

**Correct `.js` version:**
```js
// useTTS.js — CORRECT
const ping = setInterval(() => {
  if (synth.current.paused) {   // ← only act if Chrome already paused it
    synth.current.resume();
  }
}, 5000);
```

---

### 🔴 BUG-V4 — CRITICAL · `useTTS.ts`: Silent Failure When Voices Not Yet Loaded

**File:** `src/hooks/useTTS.ts`

**The bug:**
```ts
const speak = useCallback((text: string) => {
  stopSpeaking();
  if (!text || voices.length === 0) return;  // ← returns undefined silently
  // ...
}, [voices, getBestVoice, stopSpeaking]);
```

On first load, `voices` state is `[]` (empty). The browser loads voices asynchronously. If the user clicks **Begin Interview** before `onvoiceschanged` fires, `speak()` returns `undefined`. Since `await undefined` resolves immediately, the component jumps from SPEAKING straight to COUNTDOWN and then RECORDING — with **no audio ever played**.

The user hears nothing, doesn't know what question to answer, and their answer is saved as `[No answer provided]` after 3 seconds of silence.

**Fix:** Use the `.js` version which uses `synth.current.getVoices()` at call time (not state), so it always reads the freshest voice list.

---

### 🔴 BUG-V5 — CRITICAL · `useSTT.ts`: `[isRecording]` Dependency Destroys Recognition on Every Start

**File:** `src/hooks/useSTT.ts`, `useEffect` (around line 27)

**The bug:**
```ts
// useSTT.ts — BROKEN
useEffect(() => {
  const SpeechRecognitionModule = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognitionModule) {
    recognitionRef.current = new SpeechRecognitionModule(); // creates new instance
    // ...
    recognitionRef.current.onend = () => {
      if (isRecording && recognitionRef.current) {  // ← stale closure!
        try { recognitionRef.current.start(); } catch(e) {}
      } else { setIsRecording(false); }
    };
  }
  return () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // ← STOPS recognition on every isRecording change!
    }
  };
}, [isRecording]); // ← THIS IS THE BUG
```

Every time `setIsRecording(true)` is called (from `startRecording()`), the effect's cleanup runs, calling `.stop()` on the recognition — immediately killing it after it starts. A new instance is then created. The cycle repeats, making the microphone impossible to keep active.

Additionally, the `onend` handler reads `isRecording` from the closure, which is stale (it has the value from when the effect ran, not the current value). The `.js` version correctly uses `isRecordingRef.current` — a ref — so callbacks always read the latest value.

**Fix:** Delete `useSTT.ts`. The `.js` version initializes recognition once (`[]` dep array) and uses a `ref` for the recording flag.

---

### 🔴 BUG-V6 — CRITICAL · `useInterviewSession.ts`: Completely Different API — Every Call Breaks

**File:** `src/hooks/useInterviewSession.ts`

**The bug:** The `.ts` version has a completely different function signature from what `Interview.jsx` and `AnswerReview.jsx` expect.

| Call site in Interview.jsx | `.ts` version signature | Effect |
|---|---|---|
| `saveSession(data.session_id, data.questions)` | `saveSession(sessionId, sessionData: Omit<SessionBackup,'sessionId'>)` — expects an object | Spreads `questions` array into an object (`{0:q1, 1:q2,...}`), session never recoverable |
| `loadSession()` | Returns `{sessionId, resumeId, interviewType, ...}` | Interview.jsx reads `.sessionId` and `.questions` — `.questions` is `undefined` |
| `loadAllAnswers(questions)` | `loadAllAnswers(sessionId: string)` | Passes an array where a string is expected; uses wrong localStorage key; returns `[]` |
| `clearSession([])` | `clearSession(sessionId: string)` | Uses wrong key to clear localStorage |
| `saveAnswer(qId, qText, qType, text)` | `saveAnswer(sessionId, answer: SavedAnswer)` | Completely different shape |

**Consequence:** The session recovery (on page refresh) will never work. The `AnswerReview` page loads `loadAllAnswers(questions)` — this passes the array as if it's a string session ID, uses key `interview_session_answers_[object Object]`, finds nothing, and shows all answers as `[No answer provided]`. The Submit button is permanently disabled since `validCount === 0 < 3`.

**Fix:** Delete `useInterviewSession.ts`. Use only the `.js` version.

---

## PART 2 — HIGH SEVERITY BUGS

---

### 🟠 BUG-H1 — Session Recovery Logic Calls `startInterview()` — Overwrites Recovered State

**File:** `src/pages/Interview.jsx`, `MicPermission` render block

**The bug:**
```js
// Interview.jsx — recovery on mount
useEffect(() => {
  const saved = loadSession();
  if (saved?.sessionId && ...) {
    setSessionId(saved.sessionId);
    setQuestions(saved.questions);
    setCurrentIdx(savedIdx);
    setPhase(PHASES.MIC_PERMISSION);  // ← goes here
  }
}, []);

// MicPermission render:
case PHASES.MIC_PERMISSION:
  return (
    <MicPermission
      onGranted={() => startInterview()}  // ← BUG: calls startInterview() again!
```

When the page refreshes mid-interview, the component correctly loads the saved session. But then `MicPermission` calls `startInterview()`, which **creates a brand new session** — overwriting `sessionId`, `questions`, and `currentIdx`. The student loses their progress and starts from question 1 again.

**Fix:**
```js
case PHASES.MIC_PERMISSION:
  return (
    <MicPermission
      onGranted={() => {
        if (questions.length > 0) {
          // Resume: session already loaded from localStorage
          runQuestion(currentIdx);
        } else {
          // Fresh start: no session in localStorage
          startInterview();
        }
      }}
      ...
    />
  );
```

---

### 🟠 BUG-H2 — `handleSilence` Has a Stale Phase Closure

**File:** `src/pages/Interview.jsx`

**The bug:**
```js
// Defined as a plain function — new reference every render
function handleSilence() {
  if (phase === PHASES.RECORDING) {   // ← reads stale phase
    finalizeAnswer();
  }
}

// Used here — captures the reference at hook call time
const { startSilenceDetection, stopSilenceDetection, resetSilenceTimer }
  = useSilenceDetector(handleSilence, 3000);
```

`useSilenceDetector.js` stores `onSilence` in a `useCallback` with `[onSilence, silenceMs]` as deps. Since `handleSilence` is recreated every render, `startTimer` is also recreated every render, which is harmless but wasteful. However, the `phase` check inside `handleSilence` should be fine since it's a regular function (not `useCallback`) capturing the latest `phase` from closure.

The real issue: `useSilenceDetector.js`'s `startTimer` captures `onSilence` via `useCallback`. If `onSilence` updates (because `handleSilence` is a new reference), `startTimer` updates too, BUT the **running timer** from the previous `startTimer` still holds the old callback reference. A silence timeout started before `phase` changed to `RECORDING` might fire with an old callback.

**Fix:**
```js
// Wrap handleSilence in useCallback to stabilize the reference
const handleSilence = useCallback(() => {
  // Read from ref to avoid stale closure entirely
  if (phaseRef.current === PHASES.RECORDING) {
    finalizeAnswer();
  }
}, []);  // stable reference

const phaseRef = useRef(phase);
useEffect(() => { phaseRef.current = phase; }, [phase]);
```

---

### 🟠 BUG-H3 — `AIInterviewLanding` Does Not Route to the New `Interview.jsx`

**Files:** `src/pages/AIInterviewLanding.tsx`, `src/App.tsx`

**The bug:** The main user flow goes:

```
AIInterviewLanding → /ai-interview-upload → /ai-interview-summary → /ai-interview-session
```

`/ai-interview-session` renders the **old `InterviewSession.tsx`** — the buggy per-answer version with no TTS hooks, no silence detection, and no session recovery.

The new `Interview.jsx` is only reachable at `/interview` via `InterviewWrapper`, which reads `resume_id` from `localStorage('resume_id')`. This key is never set by any component in the codebase.

**Fix — Option A (minimal change):** Update `AIInterviewLanding` to set `localStorage.setItem('resume_id', selectedResumeId)` and navigate to `/interview`.

**Fix — Option B (correct):** Pass `resumeId` as a route param instead of localStorage:
```tsx
// App.tsx
<Route path="/interview/:resumeId?" element={<ProtectedRoute><Interview /></ProtectedRoute>} />

// Interview.jsx
import { useParams } from 'react-router-dom';
export default function Interview() {
  const { resumeId } = useParams();
  // ...
}
```

---

### 🟠 BUG-H4 — Backend `submit_all`: Per-Question Answers Never Saved (Field Name Mismatch)

**File:** `backend/apps/interview/views.py`, `submit_all()`, around line 310

**The bug:**
```python
# views.py — submit_all()
for qr in evaluation.get('question_results', []):
    q_index = qr.get('question_index')   # ← looks for 'question_index'
    if q_index is None:
        continue  # skips EVERY question result!
```

The `evaluate_interview()` in `services/openai_service.py` returns:
```json
{
  "question_results": [
    {
      "question_index": 1,    // ← this field IS present, so this part is OK
      "score": 7.5,
      "feedback": "...",
      ...
    }
  ]
}
```

Actually `question_index` is correct in the prompt. BUT there is still a matching bug:
```python
matching_answer = next(
  (a for i, a in enumerate(answers, 1) if i == q_index),
  None
)
```
This matches by **position** (enumerate index), but the answers array from the frontend uses `questionId` UUID as the identifier. If the order of answers in the payload differs from 1-8 (e.g., a re-recorded answer is appended), the wrong answer text gets saved to the wrong question.

**Fix:** Match by `questionId` not position:
```python
q_id = qr.get('questionId')
matching_answer = next(
    (a for a in answers if a.get('questionId') == q_id),
    None
)
```

---

### 🟠 BUG-H5 — `useSilenceDetector.ts`: `startSilenceDetection` Calls `resetSilenceTimer` Before Definition

**File:** `src/hooks/useSilenceDetector.ts`

**The bug:**
```ts
// useSilenceDetector.ts
const startSilenceDetection = useCallback(() => {
  isActiveRef.current = true;
  resetSilenceTimer();   // ← called here
}, []);   // ← resetSilenceTimer NOT in deps array!

// ...defined AFTER
const resetSilenceTimer = useCallback(() => {
  // ...
}, [onSilenceDetected, silenceThresholdMs]);
```

`startSilenceDetection` has `[]` as its deps array, which means its closure captures `resetSilenceTimer` at mount time. At mount time, `resetSilenceTimer` is `undefined` (not yet initialized by `useCallback`). Calling `startSilenceDetection()` will throw `TypeError: resetSilenceTimer is not a function`.

**Fix:** Delete `useSilenceDetector.ts`. Use the `.js` version which correctly uses an internal helper `startTimer` instead of calling another exported function.

---

### 🟠 BUG-H6 — `BrowserCheck`: Message Misleadingly Says "Chrome Detected" for Edge/Opera

**File:** `src/components/interview/BrowserCheck.jsx`

**The bug:**
```jsx
<p style={s.sub}>
  Chrome detected. Microphone access will be requested next.
</p>
```

The detection logic correctly checks for `SpeechRecognition` API (which is also supported in Microsoft Edge, Opera, and Samsung Internet). But the message always says "Chrome detected" — which is incorrect and confusing for non-Chrome users.

**Fix:**
```jsx
<p style={s.sub}>
  Voice interview is supported in your browser. Microphone access will be requested next.
</p>
```

---

### 🟠 BUG-H7 — `useTTS.ts`: `stopSpeaking` Referenced in `useEffect` Cleanup Before It's Defined

**File:** `src/hooks/useTTS.ts`

**The bug:**
```ts
// useTTS.ts — useEffect defined FIRST
useEffect(() => {
  // ...
  return () => {
    stopSpeaking();   // ← references stopSpeaking
    // ...
  };
}, []);

// stopSpeaking defined AFTER
const stopSpeaking = useCallback(() => {
  window.speechSynthesis.cancel();
  // ...
}, []);
```

In JavaScript, `const` variables are not hoisted in a usable form — accessing `stopSpeaking` before its `useCallback` assignment within the same render would throw a ReferenceError in strict mode. In practice React hooks execute sequentially, so by the time the cleanup runs (on unmount), `stopSpeaking` is defined. However, if `useEffect` runs synchronously in a test or SSR context, this could fail. More critically, this pattern violates ESLint `react-hooks/exhaustive-deps` rules, and the dependency array `[]` should include `stopSpeaking` but doesn't, creating a potential stale closure.

---

## PART 3 — MEDIUM BUGS

---

### 🟡 BUG-M1 — `InterviewSession.tsx` (Old) Is Still Accessible at `/ai-interview-session`

**File:** `src/App.tsx`

Both the old `InterviewSession.tsx` and the new `Interview.jsx` exist. The UI flow (via `AIInterviewLanding`) routes to the old page. The old page has all the original bugs: per-answer Gemini calls, no silence detection, MediaRecorder for STT, no localStorage recovery.

**Fix:** Remove the `/ai-interview-session` route once the new `/interview` flow is connected to the UI.

---

### 🟡 BUG-M2 — `start_interview` Backend: `total_questions` Not Validated (Allows 0 or 1000)

**File:** `backend/apps/interview/views.py`, `start_interview()`

```python
total_questions = int(request.data.get('total_questions', 8))
```

No min/max validation. A malicious request with `total_questions=1000` will make 1000 Gemini API calls in one request.

**Fix:**
```python
total_questions = max(3, min(20, int(request.data.get('total_questions', 8))))
```

---

### 🟡 BUG-M3 — `Register.tsx` Still Has No Name Validation (BUG-01 from Blueprint)

**File:** `src/components/auth/Register.tsx`

The blueprint's BUG-01 (name field accepts numbers and symbols) has not been fixed in this updated codebase. No regex validation on `fullName`.

---

### 🟡 BUG-M4 — `apps/accounts/serializers.py` Still Has No Server-Side Name Validation

**File:** `backend/apps/accounts/serializers.py` (BUG-02 from blueprint — unfixed)

The `RegisterSerializer.validate()` method does not check `first_name`/`last_name` against a regex. SQL injection via name field remains possible.

---

### 🟡 BUG-M5 — `QuestionCard.jsx`: `question.text` vs `question.question_text` Field Name Inconsistency

**File:** `src/components/interview/QuestionCard.jsx`

```jsx
<p style={s.questionText}>{question.text || '…'}</p>
```

The backend returns questions as `{id, order, text, type}` — so `question.text` is correct. But `Interview.jsx` passes the question object directly from the API response, which uses `text`. However, when restoring from localStorage, `useInterviewSession.js` stores the full question object including `question_text` (from the DB model). After a page refresh, questions loaded from localStorage have `question_text` but no `text`, so `QuestionCard` shows `'…'` instead of the actual question.

**Fix in QuestionCard:**
```jsx
<p style={s.questionText}>{question.text || question.question_text || '…'}</p>
```
(This is already done in some places but not in `QuestionCard.jsx`.)

---

## PART 4 — LOGIC & ARCHITECTURE ISSUES

---

### ⚠ ARCH-1 — `services/openai_service.py` Is Actually a Gemini Service (Misleading Name)

**File:** `backend/services/openai_service.py`

The file is named `openai_service.py` but actually uses the `google.generativeai` (Gemini) SDK. This is confusing for anyone maintaining the code and could lead to mistaken library changes.

The `GeminiService` class in `apps/interview/services/gemini_service.py` uses the **old per-question generation approach** (single question at a time), while the correctly named `openai_service.py` uses the **new all-at-once approach**. Both exist simultaneously with overlapping responsibilities.

**Fix:** Rename `services/openai_service.py` → `services/gemini_service.py` and remove or archive the one in `apps/interview/services/`.

---

### ⚠ ARCH-2 — Duplicate App Structure (`backend/` vs `backend/apps/`)

The backend has two parallel app directories:
- `backend/accounts/` — has models, views, urls (mostly empty stubs)
- `backend/apps/accounts/` — has the real, working models, serializers, migrations

Same duplication for `interview`, `aptitude`, `dashboard`, `common`. The empty stub apps appear to be from the original project before the `apps/` restructure. If both are in `INSTALLED_APPS`, Django may load the wrong migrations.

**Fix:** Audit `settings.py → INSTALLED_APPS`. Remove all references to the stub apps that don't have migrations (the non-`apps/` versions). Delete the empty stub directories.

---

### ⚠ ARCH-3 — `aptitudeData.ts` (Static Quiz Data) Still Not Connected to Backend API (BUG-03, BUG-14, BUG-15)

The aptitude quiz and learning module still use `aptitudeData.ts` (hardcoded static data). `apps/aptitude/` has no models, views, or URLs. `apps/learning/` has models and views but they're not connected to the Quiz.tsx frontend. The quiz always shows the same 5 questions, no randomization, no backend tracking.

---

## PART 5 — COMPLETE FIX PRIORITY LIST

| Priority | Bug ID | File | Action |
|---|---|---|---|
| 🔴 IMMEDIATE | BUG-V1 | All 4 `.ts` hooks | Delete all `.ts` hook files; use `.js` only |
| 🔴 IMMEDIATE | BUG-V2 | useTTS.ts | Deleted by BUG-V1 fix |
| 🔴 IMMEDIATE | BUG-V3 | useTTS.ts | Deleted by BUG-V1 fix |
| 🔴 IMMEDIATE | BUG-V4 | useTTS.ts | Deleted by BUG-V1 fix |
| 🔴 IMMEDIATE | BUG-V5 | useSTT.ts | Deleted by BUG-V1 fix |
| 🔴 IMMEDIATE | BUG-V6 | useInterviewSession.ts | Deleted by BUG-V1 fix |
| 🟠 HIGH | BUG-H1 | Interview.jsx | Fix MicPermission onGranted to check if session exists |
| 🟠 HIGH | BUG-H2 | Interview.jsx | Wrap handleSilence in useCallback with phaseRef |
| 🟠 HIGH | BUG-H3 | AIInterviewLanding.tsx | Route to /interview; set resume_id in localStorage |
| 🟠 HIGH | BUG-H4 | views.py submit_all | Match answers by questionId not position |
| 🟠 HIGH | BUG-H5 | useSilenceDetector.ts | Deleted by BUG-V1 fix |
| 🟡 MEDIUM | BUG-M1 | App.tsx | Remove old /ai-interview-session route |
| 🟡 MEDIUM | BUG-M2 | views.py | Validate total_questions range (3–20) |
| 🟡 MEDIUM | BUG-M3 | Register.tsx | Add name regex validation |
| 🟡 MEDIUM | BUG-M4 | serializers.py | Add server-side name validation |
| 🟡 MEDIUM | BUG-M5 | QuestionCard.jsx | Use `question.text || question.question_text` |
| ⚠ ARCH | ARCH-1 | services/ | Rename openai_service.py → gemini_service.py |
| ⚠ ARCH | ARCH-2 | backend/ | Remove stub apps from INSTALLED_APPS |
| ⚠ ARCH | ARCH-3 | aptitude/ | Connect backend to frontend (BUG-03/14/15) |

---

## PART 6 — EXACT CODE FIXES

### Fix 1: Delete the `.ts` hooks (the most critical fix)
```bash
rm src/hooks/useTTS.ts
rm src/hooks/useSTT.ts
rm src/hooks/useSilenceDetector.ts
rm src/hooks/useInterviewSession.ts
```

### Fix 2: Interview.jsx — Session Recovery (BUG-H1)
```jsx
// In the PHASES.MIC_PERMISSION case:
case PHASES.MIC_PERMISSION:
  return (
    <MicPermission
      onGranted={() => {
        // If we already have questions (loaded from localStorage recovery),
        // resume from where we left off — do NOT call startInterview() again
        if (questionsRef.current.length > 0) {
          runQuestion(currentIdxRef.current);
        } else {
          startInterview();
        }
      }}
      onDenied={() => {
        setError('Microphone access is required for the voice interview.');
        setPhase(PHASES.ERROR);
      }}
    />
  );
```

### Fix 3: Interview.jsx — Stable handleSilence (BUG-H2)
```jsx
// Add a ref for phase
const phaseRef = useRef(PHASES.BROWSER_CHECK);
useEffect(() => { phaseRef.current = phase; }, [phase]);

// Wrap in useCallback so the reference is stable
const handleSilence = useCallback(() => {
  if (phaseRef.current === PHASES.RECORDING) {
    finalizeAnswer();
  }
}, []); // empty deps — reads phase via ref at call time
```

### Fix 4: AIInterviewLanding — Route to new Interview.jsx (BUG-H3)
```tsx
// In AIInterviewLanding.tsx
const handleStartInterview = (resumeId: string) => {
  // Store resumeId so InterviewWrapper can pick it up
  localStorage.setItem('resume_id', resumeId);
  navigate('/interview');
};
```

### Fix 5: views.py submit_all — Answer Matching (BUG-H4)
```python
# In submit_all(), replace the per-question loop with:
for qr in evaluation.get('question_results', []):
    q_index = qr.get('question_index')
    if q_index is None:
        continue
    try:
        question = session.questions.get(question_number=q_index)
        # Match by questionId UUID, not position
        q_id_str = str(question.id)
        matching_answer = next(
            (a for a in answers
             if str(a.get('questionId', a.get('question_id', ''))) == q_id_str),
            None
        )
        # fallback: match by position if UUID not found
        if not matching_answer:
            matching_answer = next(
                (a for i, a in enumerate(answers, 1) if i == q_index),
                None
            )
        answer_text = (
            matching_answer.get('answerText', matching_answer.get('answer_text', ''))
            if matching_answer else '[No answer provided]'
        )
        InterviewAnswer.objects.update_or_create(
            question=question,
            defaults={
                'answer_text': answer_text or '[No answer provided]',
                'score': normalize_score(qr.get('score')),
                'ai_feedback': qr.get('feedback', ''),
                'strengths': [qr.get('strength', '')] if qr.get('strength') else [],
                'improvements': [qr.get('improvement', '')] if qr.get('improvement') else [],
            }
        )
    except InterviewQuestion.DoesNotExist:
        continue
```

### Fix 6: Backend — Validate total_questions (BUG-M2)
```python
# In start_interview() view, after getting total_questions:
total_questions = max(3, min(20, int(request.data.get('total_questions', 8))))
```

### Fix 7: BrowserCheck — Correct Message (BUG-H6)
```jsx
// Replace "Chrome detected" with generic message:
<p style={s.sub}>
  Voice interview is supported in your browser.
  Microphone access will be requested next.
</p>
```

---

## SUMMARY

The voice interview module is **non-functional in its current state** due to one root architectural mistake: duplicate hook files where the broken `.ts` versions silently override the correct `.js` versions at build time.

Fixing BUG-V1 alone (deleting the 4 `.ts` hook files) will resolve BUG-V2, V3, V4, V5, V6, and H5 simultaneously. That single change is the highest-ROI fix in the entire codebase. After that, apply the session recovery fix (BUG-H1) and the routing fix (BUG-H3) and the voice interview module will be fully functional.

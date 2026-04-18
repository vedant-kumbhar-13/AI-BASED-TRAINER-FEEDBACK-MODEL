# ANTIGRAVITY AGENT — COMPLETE FIX PROMPT

# Model: Claude Sonnet 4.6 (Thinking) — switch in dropdown before pasting this

# DO NOT split this into multiple prompts — paste the entire thing at once

---

## YOUR ROLE & CONSTRAINTS

You are a senior full-stack engineer fixing a React + Django interview training app.

CRITICAL RULES — follow every single one:

1. DO NOT change any color, theme, gradient, font, or visual style anywhere. The app uses a light same suite as the other pages. for interview pages and a light reddish/warm theme for dashboard/learning pages. Touch ZERO CSS/Tailwind/inline styles.
2. DO NOT rename any existing routes in App.tsx unless specifically told to add a new one.
3. DO NOT modify any file not listed in the tasks below.
4. DO NOT install any new npm packages.
5. DO NOT delete any backend Python files.
6. DO NOT touch `aptitudeData.ts`, `Learning.tsx`, `Quiz.tsx`, or any learning/aptitude frontend file.
7. After every file edit, verify the edit was saved correctly before moving to the next file.
8. Work through the tasks IN ORDER — do not skip any.

---

## TASK 1 — DELETE THE 4 BROKEN `.ts` HOOK FILES (Most Critical Fix)

These files are being picked up by Vite INSTEAD of the correct `.js` versions.
Vite resolves `.ts` before `.js` when there is no extension in the import.
Deleting these 4 files makes Vite automatically use the correct `.js` versions.

DELETE these exact files (do not modify them, just delete):

```
ai-trainer/frontend/src/hooks/useTTS.ts
ai-trainer/frontend/src/hooks/useSTT.ts
ai-trainer/frontend/src/hooks/useSilenceDetector.ts
ai-trainer/frontend/src/hooks/useInterviewSession.ts
```

After deleting, verify the following `.js` files still exist (do NOT touch them):

```
ai-trainer/frontend/src/hooks/useTTS.js          ← KEEP
ai-trainer/frontend/src/hooks/useSTT.js          ← KEEP
ai-trainer/frontend/src/hooks/useSilenceDetector.js  ← KEEP
ai-trainer/frontend/src/hooks/useInterviewSession.js ← KEEP
```

---

## TASK 2 — FIX `Interview.jsx` — Session Recovery + Stable Silence Handler

File: `ai-trainer/frontend/src/pages/Interview.jsx`

DO NOT change any styles, colors, or visual layout in this file.

### Change 2A — Add a `phaseRef` to avoid stale closure in `handleSilence`

Find the block that starts with:

```js
// Stable ref for currentIdx so async callbacks read latest value
const currentIdxRef = useRef(0);
useEffect(() => {
	currentIdxRef.current = currentIdx;
}, [currentIdx]);

// Stable ref for questions
const questionsRef = useRef([]);
useEffect(() => {
	questionsRef.current = questions;
}, [questions]);
```

ADD these two lines immediately after that block (after the questionsRef lines):

```js
// Stable ref for phase so handleSilence never reads a stale closure value
const phaseRef = useRef(PHASES.BROWSER_CHECK);
useEffect(() => {
	phaseRef.current = phase;
}, [phase]);
```

### Change 2B — Replace `handleSilence` function

Find this exact function:

```js
// ── handleSilence — triggered by useSilenceDetector after 3s ──────────
function handleSilence() {
	if (phase === PHASES.RECORDING) {
		finalizeAnswer();
	}
}
```

Replace it with:

```js
// ── handleSilence — triggered by useSilenceDetector after 3s ──────────
// Uses phaseRef (not state) so callback never reads a stale phase value
const handleSilence = useCallback(() => {
	if (phaseRef.current === PHASES.RECORDING) {
		finalizeAnswer();
	}
}, []); // stable reference — reads phase via ref at call time
```

NOTE: `useCallback` is already imported at the top of Interview.jsx — do not add a duplicate import.

### Change 2C — Fix the `MIC_PERMISSION` case to NOT call `startInterview()` when session already loaded

Find this exact block in the switch statement:

```js
case PHASES.MIC_PERMISSION:
  return (
    <MicPermission
      onGranted={() => startInterview()}
      onDenied={() => {
        setError('Microphone access is required for the voice interview.');
        setPhase(PHASES.ERROR);
      }}
    />
  );
```

Replace it with:

```js
case PHASES.MIC_PERMISSION:
  return (
    <MicPermission
      onGranted={() => {
        // If questions already loaded from localStorage (page-refresh recovery),
        // resume from the saved index — do NOT start a new session
        if (questionsRef.current.length > 0) {
          runQuestion(currentIdxRef.current);
        } else {
          // Fresh start — fetch questions from backend
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

---

## TASK 3 — FIX `AIInterviewLanding.tsx` — Connect to the New `Interview.jsx`

File: `ai-trainer/frontend/src/pages/AIInterviewLanding.tsx`

DO NOT change any colors, Tailwind classes, or layout.

### Change 3A — Update `handleUploadResume` to store interviewType

Find:

```ts
const handleUploadResume = () => {
	navigate("/ai-interview-upload", { state: { interviewType: selectedType } });
};
```

Replace with:

```ts
const handleUploadResume = () => {
	// Store the selected interview type so Interview.jsx can read it
	localStorage.setItem("interview_type", selectedType);
	navigate("/ai-interview-upload", { state: { interviewType: selectedType } });
};
```

### Change 3B — Update `handleQuickInterview` to route to the new Interview.jsx

Find:

```ts
const handleQuickInterview = () => {
	navigate("/ai-interview-summary", {
		state: { interviewType: selectedType, skipResume: true },
	});
};
```

Replace with:

```ts
const handleQuickInterview = () => {
	// Clear any stale resume_id so Interview.jsx uses the user's latest resume
	localStorage.removeItem("resume_id");
	localStorage.setItem("interview_type", selectedType);
	navigate("/interview");
};
```

---

## TASK 4 — FIX `App.tsx` — Update `InterviewWrapper` to Read interview_type

File: `ai-trainer/frontend/src/App.tsx`

DO NOT change any routes, only the `InterviewWrapper` function.

Find:

```tsx
function InterviewWrapper() {
	const resumeId = localStorage.getItem("resume_id") || "";
	return <Interview resumeId={resumeId} />;
}
```

Replace with:

```tsx
function InterviewWrapper() {
	const resumeId = localStorage.getItem("resume_id") || "";
	const interviewType = localStorage.getItem("interview_type") || "Technical";
	return <Interview resumeId={resumeId} interviewType={interviewType} />;
}
```

---

## TASK 5 — FIX `QuestionCard.jsx` — Handle Both `text` and `question_text` Field Names

File: `ai-trainer/frontend/src/components/interview/QuestionCard.jsx`

DO NOT change any styles or layout.

Find:

```jsx
<p style={s.questionText}>{question.text || "…"}</p>
```

Replace with:

```jsx
<p style={s.questionText}>{question.text || question.question_text || "…"}</p>
```

---

## TASK 6 — FIX `BrowserCheck.jsx` — Incorrect "Chrome detected" Message

File: `ai-trainer/frontend/src/components/interview/BrowserCheck.jsx`

DO NOT change any styles, colors, or layout.

Find:

```jsx
<p style={s.sub}>Chrome detected. Microphone access will be requested next.</p>
```

Replace with:

```jsx
<p style={s.sub}>
	Voice interview is supported in your browser. Microphone access will be
	requested next.
</p>
```

---

## TASK 7 — FIX `views.py` — Validate `total_questions` Range + Fix Answer Matching

File: `ai-trainer/backend/apps/interview/views.py`

DO NOT change any response shapes, status codes, or imports.

### Change 7A — Validate total_questions (prevent 0 or 1000)

In the `start_interview` view function, find:

```python
total_questions = int(request.data.get('total_questions', 8))
```

Replace with:

```python
# Clamp to safe range — prevents malicious requests generating 1000 questions
total_questions = max(3, min(20, int(request.data.get('total_questions', 8))))
```

### Change 7B — Fix answer-to-question matching in `submit_all`

In the `submit_all` view function, find this entire block:

```python
        # Save per-question AI scores into InterviewAnswer rows
        for qr in evaluation.get('question_results', []):
            q_index = qr.get('question_index')
            if q_index is None:
                continue
            try:
                question = session.questions.get(question_number=q_index)
                # Find matching answer from the submitted payload
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
                        'answer_text':  answer_text or '[No answer provided]',
                        'score':        normalize_score(qr.get('score')),
                        'ai_feedback':  qr.get('feedback', ''),
                        'strengths':    [qr.get('strength', '')] if qr.get('strength') else [],
                        'improvements': [qr.get('improvement', '')] if qr.get('improvement') else [],
                    }
                )
            except InterviewQuestion.DoesNotExist:
                continue
```

Replace the entire block with:

```python
        # Save per-question AI scores into InterviewAnswer rows
        for qr in evaluation.get('question_results', []):
            q_index = qr.get('question_index')
            if q_index is None:
                continue
            try:
                question = session.questions.get(question_number=q_index)
                q_id_str = str(question.id)

                # Match by questionId UUID first (most reliable, handles re-recorded answers)
                matching_answer = next(
                    (a for a in answers
                     if str(a.get('questionId', a.get('question_id', ''))) == q_id_str),
                    None
                )
                # Fallback: match by position if UUID not found
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
                        'answer_text':  answer_text or '[No answer provided]',
                        'score':        normalize_score(qr.get('score')),
                        'ai_feedback':  qr.get('feedback', ''),
                        'strengths':    [qr.get('strength', '')] if qr.get('strength') else [],
                        'improvements': [qr.get('improvement', '')] if qr.get('improvement') else [],
                    }
                )
            except InterviewQuestion.DoesNotExist:
                continue
```

---

## TASK 8 — VERIFY ALL `.js` HOOKS ARE SYNTACTICALLY CORRECT

After all the above tasks, open each of these files and verify they have no syntax errors:

1. `ai-trainer/frontend/src/hooks/useTTS.js` — check `speak()` returns a `new Promise(...)`
2. `ai-trainer/frontend/src/hooks/useSTT.js` — check `useEffect` has `[]` (empty) dependency array
3. `ai-trainer/frontend/src/hooks/useSilenceDetector.js` — check `startSilenceDetection` calls `startTimer()` not `resetSilenceTimer()`
4. `ai-trainer/frontend/src/hooks/useInterviewSession.js` — check `saveSession(sessionId, questions)` takes two args (string + array)

If any of these files have a syntax error, report it but do NOT auto-fix — ask me first.

---

## TASK 9 — FINAL VERIFICATION CHECKLIST

After completing all tasks, confirm each item:

- [ ] `src/hooks/useTTS.ts` — FILE DELETED (does not exist)
- [ ] `src/hooks/useSTT.ts` — FILE DELETED (does not exist)
- [ ] `src/hooks/useSilenceDetector.ts` — FILE DELETED (does not exist)
- [ ] `src/hooks/useInterviewSession.ts` — FILE DELETED (does not exist)
- [ ] `src/hooks/useTTS.js` — EXISTS and unchanged
- [ ] `src/hooks/useSTT.js` — EXISTS and unchanged
- [ ] `src/hooks/useSilenceDetector.js` — EXISTS and unchanged
- [ ] `src/hooks/useInterviewSession.js` — EXISTS and unchanged
- [ ] `Interview.jsx` — has `phaseRef`, `handleSilence` uses `useCallback`, `MIC_PERMISSION` checks `questionsRef.current.length`
- [ ] `QuestionCard.jsx` — uses `question.text || question.question_text || '…'`
- [ ] `BrowserCheck.jsx` — no longer says "Chrome detected"
- [ ] `views.py` — `total_questions` clamped to 3–20, answer matching uses questionId UUID
- [ ] NO styles, colors, or themes changed in any file
- [ ] NO new npm packages installed

---

## WHAT NOT TO DO

- Do NOT run `npm install` for any package
- Do NOT change `tailwind.config.js`
- Do NOT change `index.css`
- Do NOT change colors in `QuestionCard.jsx`, `BrowserCheck.jsx`, `MicPermission.jsx`, `PreBrief.jsx`, `AnswerReview.jsx`, `InterviewResults.jsx`, or `Interview.jsx`
- Do NOT touch the dashboard, learning, or quiz modules
- Do NOT modify `aptitudeData.ts`
- Do NOT modify `InterviewSession.tsx` (the old file — leave it untouched)
- Do NOT modify any Django migration files

---

## SUMMARY OF WHAT THIS FIXES

| #   | Bug                                        | Effect After Fix                               |
| --- | ------------------------------------------ | ---------------------------------------------- |
| 1   | `.ts` hooks override `.js` hooks           | Voice system becomes functional                |
| 2   | `speak()` returned void instead of Promise | TTS now plays fully before countdown starts    |
| 3   | Keep-alive stuttered speech every 5s       | TTS audio is smooth and uninterrupted          |
| 4   | STT killed itself on every start           | Microphone stays active for full answer        |
| 5   | Silence detector crashed on start          | Auto-advance after 3s silence works            |
| 6   | Session recovery called startInterview()   | Page refresh correctly resumes session         |
| 7   | Answer matching used position not UUID     | Re-recorded answers saved to correct question  |
| 8   | total_questions not validated              | Server protected from malicious large requests |
| 9   | QuestionCard showed '…' after refresh      | Question text shows correctly on recovery      |
| 10  | BrowserCheck said "Chrome detected" always | Correct message for all supported browsers     |

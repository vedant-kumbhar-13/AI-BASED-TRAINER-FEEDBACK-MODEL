// Main interview controller — state machine
// This is the top-level orchestrator for the entire interview flow.

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Hooks ────────────────────────────────────────────────────────────────────
import { useTTS }               from '../hooks/useTTS';
import { useSTT }               from '../hooks/useSTT';
import { useSilenceDetector }   from '../hooks/useSilenceDetector';
import { useInterviewSession }  from '../hooks/useInterviewSession';

// ── API service ──────────────────────────────────────────────────────────────
import { startSession, submitAll } from '../services/api/interview';

// ── Components ───────────────────────────────────────────────────────────────
import BrowserCheck    from '../components/interview/BrowserCheck';
import MicPermission   from '../components/interview/MicPermission';
import LoadingScreen   from '../components/interview/LoadingScreen';
import PreBrief        from '../components/interview/PreBrief';
import QuestionCard    from '../components/interview/QuestionCard';
import AnswerReview    from '../components/interview/AnswerReview';
import InterviewResults from './InterviewResults';

// ── Phase constants ──────────────────────────────────────────────────────────
const PHASES = Object.freeze({
  BROWSER_CHECK:    'BROWSER_CHECK',
  MIC_PERMISSION:   'MIC_PERMISSION',
  LOADING_QUESTIONS:'LOADING_QUESTIONS',
  PRE_BRIEF:        'PRE_BRIEF',
  SPEAKING:         'SPEAKING',
  COUNTDOWN:        'COUNTDOWN',
  RECORDING:        'RECORDING',
  SAVING_ANSWER:    'SAVING_ANSWER',
  REVIEW:           'REVIEW',
  SUBMITTING:       'SUBMITTING',
  RESULTS:          'RESULTS',
  ERROR:            'ERROR',
});

/**
 * Interview — main state-machine controller.
 * Props: { resumeId, interviewType }
 */
export default function Interview({ resumeId, interviewType = 'Technical' }) {
  // ── State ──────────────────────────────────────────────────────────────
  const [phase,        setPhase]       = useState(PHASES.BROWSER_CHECK);
  const [questions,    setQuestions]   = useState([]);
  const [currentIdx,   setCurrentIdx]  = useState(0);
  const [sessionId,    setSessionId]   = useState(null);
  const [results,      setResults]     = useState(null);
  const [error,        setError]       = useState(null);
  const [countdown,    setCountdown]   = useState(2);
  const [textFallback, setTextFallback]= useState(false);

  // Stable refs — async callbacks always read latest values without stale closures
  const currentIdxRef = useRef(0);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  const questionsRef = useRef([]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);

  // phaseRef — lets handleSilence read the current phase without being re-created
  const phaseRef = useRef(PHASES.BROWSER_CHECK);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Guard: prevent React 18 Strict Mode double-invocation of startInterview()
  const isStartingRef = useRef(false);

  // ── FIX: stable silence callback indirection ───────────────────────────
  // Problem: useSilenceDetector(handleSilence) is called at line ~85,
  // but handleSilence is a useCallback declared later at ~120.
  // useCallback is NOT hoisted → the hook received `undefined` → white screen crash.
  //
  // Solution: pass a stable wrapper ref to the hook. The wrapper calls
  // handleSilenceRef.current which is updated each render to the real function.
  const handleSilenceRef = useRef(null);
  const stableHandleSilence = useCallback(() => {
    if (handleSilenceRef.current) handleSilenceRef.current();
  }, []); // identity never changes — safe to pass to the hook

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { speak, stopSpeaking } = useTTS();

  const {
    transcript, isRecording, isSupported,
    sttError, startRecording, stopRecording, resetTranscript,
  } = useSTT();

  const {
    startSilenceDetection,
    stopSilenceDetection,
    resetSilenceTimer,
  } = useSilenceDetector(stableHandleSilence, 3000); // ← uses stable wrapper

  const {
    saveSession, loadSession,
    saveCurrentIndex, loadCurrentIndex,
    saveAnswer, loadAllAnswers, clearSession,
  } = useInterviewSession();

  // ── Effect 1: crash recovery on mount ─────────────────────────────────
  useEffect(() => {
    const saved = loadSession();
    if (saved?.sessionId && Array.isArray(saved.questions) && saved.questions.length > 0) {
      const savedIdx = loadCurrentIndex();
      setSessionId(saved.sessionId);
      setQuestions(saved.questions);
      setCurrentIdx(savedIdx);
      setPhase(PHASES.MIC_PERMISSION);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: reset silence timer on new transcript ───────────────────
  useEffect(() => {
    if (phase === PHASES.RECORDING && transcript) {
      resetSilenceTimer();
    }
  }, [transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 3: mic permission denied → ERROR ───────────────────────────
  useEffect(() => {
    if (sttError === 'not-allowed') {
      setError('Microphone access was denied. Please allow microphone access and try again.');
      setPhase(PHASES.ERROR);
    }
  }, [sttError]);

  // ── handleSilence — triggered by useSilenceDetector after 3 s ─────────
  // Reads phaseRef so it never closes over a stale phase value.
  const handleSilence = useCallback(() => {
    if (phaseRef.current === PHASES.RECORDING) {
      finalizeAnswer(); // eslint-disable-line no-use-before-define
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the ref pointing to the latest version (runs synchronously each render)
  handleSilenceRef.current = handleSilence;

  // ── runQuestion(index) — async: speaking → countdown → recording ───────
  async function runQuestion(index) {
    const qs = questionsRef.current;

    if (index >= qs.length) {
      setPhase(PHASES.REVIEW);
      return;
    }

    const q = qs[index];

    resetTranscript();
    saveCurrentIndex(index);

    // 1. SPEAKING — TTS reads the question aloud
    stopSpeaking();
    setPhase(PHASES.SPEAKING);
    try {
      await speak(`Question ${index + 1}. ${q.text || q.question_text}`);
    } catch {
      // TTS failed — skip to countdown
    }

    // 2. COUNTDOWN — 2 → 1 → 0
    setPhase(PHASES.COUNTDOWN);
    setCountdown(2);
    await new Promise((resolve) => {
      let count = 2;
      const tick = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) { clearInterval(tick); resolve(); }
      }, 900);
    });

    // 3. RECORDING — start mic + silence detector
    setPhase(PHASES.RECORDING);
    startRecording();
    startSilenceDetection();
  }

  // ── finalizeAnswer() — called on silence or manual skip ───────────────
  function finalizeAnswer() {
    stopSilenceDetection();
    const finalText = stopRecording();

    const qs  = questionsRef.current;
    const idx = currentIdxRef.current;
    const q   = qs[idx];

    if (q) {
      saveAnswer(
        q.id,
        q.text || q.question_text || '',
        q.type || q.question_type || 'Technical',
        finalText || '[No answer provided]'
      );
    }

    setPhase(PHASES.SAVING_ANSWER);

    setTimeout(() => {
      const nextIdx = idx + 1;
      setCurrentIdx(nextIdx);
      runQuestion(nextIdx);
    }, 800);
  }

  // ── startInterview() — fetch questions from backend ───────────────────
  async function startInterview() {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    setPhase(PHASES.LOADING_QUESTIONS);
    try {
      const data = await startSession(resumeId, interviewType);
      setSessionId(data.session_id);
      setQuestions(data.questions);
      saveSession(data.session_id, data.questions);
      setCurrentIdx(0);
      setPhase(PHASES.PRE_BRIEF);
    } catch (err) {
      const serverMsg = err?.message || '';
      let userMsg;

      if (serverMsg.toLowerCase().includes('active session')) {
        clearSession([]);
        userMsg =
          'A previous interview session is still active. ' +
          'Click "Try Again" to start fresh — the old session has been cleared.';
      } else if (serverMsg.toLowerCase().includes('no resume found')) {
        userMsg = 'Please upload a resume first, or use Quick Interview which works without one.';
      } else if (serverMsg.toLowerCase().includes('question generation failed')) {
        userMsg = 'Could not generate questions right now (AI service is busy). Please try again in a moment.';
      } else {
        userMsg = serverMsg || 'Failed to start interview. Please try again.';
      }

      setError(userMsg);
      setPhase(PHASES.ERROR);
    } finally {
      isStartingRef.current = false;
    }
  }

  // ── submitInterview() — send all answers for AI evaluation ────────────
  async function submitInterview() {
    setPhase(PHASES.SUBMITTING);
    try {
      const allAnswers = loadAllAnswers(questionsRef.current);
      const payload = allAnswers.map(a => ({
        questionId:   a.questionId,
        questionText: a.questionText,
        questionType: a.questionType,
        answerText:   a.answerText,
      }));
      const evaluation = await submitAll(sessionId, payload);
      clearSession(questionsRef.current);
      setResults(evaluation);
      setPhase(PHASES.RESULTS);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Submission failed. Your answers are saved.';
      setError(msg);
      setPhase(PHASES.ERROR);
    }
  }

  // ── handleReRecord(index) — jump back to re-record a question ─────────
  function handleReRecord(index) {
    setCurrentIdx(index);
    runQuestion(index);
  }

  // ── RENDER — phase switch ──────────────────────────────────────────────
  switch (phase) {

    case PHASES.BROWSER_CHECK:
      return (
        <BrowserCheck
          onContinue={() => setPhase(PHASES.MIC_PERMISSION)}
          onFallback={() => {
            setTextFallback(true);
            setPhase(PHASES.MIC_PERMISSION);
          }}
        />
      );

    case PHASES.MIC_PERMISSION:
      return (
        <MicPermission
          onGranted={() => {
            // If questions already loaded (page-refresh recovery), resume — don't start fresh
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

    case PHASES.LOADING_QUESTIONS:
      return <LoadingScreen message="Generating your personalised questions…" />;

    case PHASES.PRE_BRIEF:
      return (
        <PreBrief
          questions={questions}
          onBegin={() => runQuestion(0)}
        />
      );

    case PHASES.SPEAKING:
    case PHASES.COUNTDOWN:
    case PHASES.RECORDING:
    case PHASES.SAVING_ANSWER:
      return (
        <QuestionCard
          phase={phase.toLowerCase()}
          question={questions[currentIdx] || {}}
          questionNumber={currentIdx + 1}
          totalQuestions={questions.length}
          transcript={transcript}
          countdown={countdown}
          onSkip={finalizeAnswer}
        />
      );

    case PHASES.REVIEW:
      return (
        <AnswerReview
          questions={questions}
          sessionId={sessionId}
          onSubmit={submitInterview}
          onReRecord={handleReRecord}
        />
      );

    case PHASES.SUBMITTING:
      return <LoadingScreen message="Analysing your interview… this takes 20–30 seconds." />;

    case PHASES.RESULTS:
      return <InterviewResults results={results} />;

    case PHASES.ERROR:
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh',
          background: 'linear-gradient(135deg,#0f172a,#1e293b)',
          fontFamily: "'Inter','Segoe UI',sans-serif", padding: '24px',
        }}>
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '20px', padding: '40px', maxWidth: '480px', width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ color: '#f87171', fontWeight: '700', fontSize: '20px', marginBottom: '12px' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#fca5a5', fontSize: '14px', lineHeight: '1.7', marginBottom: '28px' }}>
              {error || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => {
                setError(null);
                isStartingRef.current = false;
                setPhase(PHASES.BROWSER_CHECK);
              }}
              style={{
                padding: '12px 28px', borderRadius: '10px',
                background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
                color: '#f87171', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
              }}
            >
              🔄 Try Again
            </button>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// src/pages/InterviewSession.tsx
// Real-time conversational AI interview — Gemini generates each question
// based on the previous answer, like a live human interviewer.

import React, {
  useState, useEffect, useRef, useCallback
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

// ── Local hook imports ────────────────────────────────────────────────────────
// Create these files in src/hooks/ from the companion hook files
import { useTTS }               from '../hooks/useTTS';
import { useSTT }               from '../hooks/useSTT';
import { useSilenceDetector }   from '../hooks/useSilenceDetector';
import { useInterviewSession }  from '../hooks/useInterviewSession';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Question {
  id: string;
  question_text: string;
  question_number: number;
  category: string;
}

interface ChatMessage {
  role: 'interviewer' | 'you';
  text: string;
  questionNumber?: number;
}

// ── Phase constants ───────────────────────────────────────────────────────────
const PHASES = {
  INIT:         'init',           // pre-start
  MIC_CHECK:    'mic_check',      // requesting mic
  LOADING:      'loading',        // calling /start/ API
  SPEAKING:     'speaking',       // TTS reading question
  COUNTDOWN:    'countdown',      // 2s before mic opens
  RECORDING:    'recording',      // user speaking — mic active
  PROCESSING:   'processing',     // sending answer → getting next Q from Gemini
  DONE:         'done',           // all questions answered — show submit
  SUBMITTING:   'submitting',     // final evaluation in progress
  ERROR:        'error',
} as const;

type Phase = typeof PHASES[keyof typeof PHASES];

const SILENCE_MS    = 3000;  // 3s silence → auto-finalize answer
const SAVE_FLASH_MS = 600;

const BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000/api';

function authHeader() {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function categoryColor(cat: string) {
  const c = (cat || '').toLowerCase();
  if (c === 'technical' || c === 'problem_solving') return '#f97316';
  if (c === 'behavioral' || c === 'situational')    return '#a855f7';
  if (c === 'follow_up')                            return '#22c55e';
  return '#3b82f6';
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    hr: 'HR', technical: 'Technical', behavioral: 'Behavioral',
    follow_up: 'Follow-up', situational: 'Situational',
    problem_solving: 'Problem Solving', general: 'General',
    introduction: 'Introduction',
  };
  return map[(cat || '').toLowerCase()] || cat || 'General';
}

function pad2(n: number) { return n.toString().padStart(2, '0'); }
function formatTime(s: number) { return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; }

// ══════════════════════════════════════════════════════════════════════════════
export default function InterviewSession() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const locState  = (location.state || {}) as {
    resumeId?: string;
    interviewType?: string;
    sessionId?: string;
  };

  // ── State ─────────────────────────────────────────────────────────────────
  const [phase, setPhase]               = useState<Phase>(PHASES.INIT);
  const [currentQ, setCurrentQ]         = useState<Question | null>(null);
  const [sessionId, setSessionId]       = useState<string | null>(locState.sessionId || null);
  const [totalQ, setTotalQ]             = useState(8);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [isLast, setIsLast]             = useState(false);
  const [chatLog, setChatLog]           = useState<ChatMessage[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [elapsed, setElapsed]           = useState(0);
  const [countdown, setCountdown]       = useState(2);
  const [silenceLeft, setSilenceLeft]   = useState(100);  // % bar
  const [errorMsg, setErrorMsg]         = useState('');
  const [results, setResults]           = useState<any>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const phaseRef      = useRef<Phase>(PHASES.INIT);
  const currentQRef   = useRef<Question | null>(null);
  const answeredRef   = useRef(0);
  const sessionIdRef  = useRef<string | null>(null);
  const timerIv       = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceIv     = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEl  = useRef<HTMLDivElement>(null);

  // sync refs
  useEffect(() => { phaseRef.current    = phase;         }, [phase]);
  useEffect(() => { currentQRef.current = currentQ;      }, [currentQ]);
  useEffect(() => { answeredRef.current = answeredCount; }, [answeredCount]);
  useEffect(() => { sessionIdRef.current = sessionId;    }, [sessionId]);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { speak, stopSpeaking }                                      = useTTS();
  const { transcript, isRecording, isSupported, sttError,
          startRecording, stopRecording, resetTranscript }           = useSTT();
  const { saveAnswer, loadAllAnswers, saveSession,
          loadSession, saveCurrentIndex, loadCurrentIndex,
          clearSession }                                              = useInterviewSession();

  // silence detection — stable callback via ref
  const onSilenceRef = useRef(() => {});
  const stableOnSilence = useCallback(() => onSilenceRef.current(), []);
  const { startSilenceDetection, stopSilenceDetection, resetSilenceTimer }
      = useSilenceDetector(stableOnSilence, SILENCE_MS);

  // ── Global timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const active = [PHASES.SPEAKING, PHASES.COUNTDOWN, PHASES.RECORDING, PHASES.PROCESSING];
    if (active.includes(phase)) {
      if (!timerIv.current) timerIv.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerIv.current) { clearInterval(timerIv.current); timerIv.current = null; }
    }
  }, [phase]);

  useEffect(() => () => {
    if (timerIv.current) clearInterval(timerIv.current);
    if (silenceIv.current) clearInterval(silenceIv.current);
  }, []);

  // ── Wire transcript changes to silence detector ───────────────────────────
  useEffect(() => {
    if (phaseRef.current === PHASES.RECORDING) {
      resetSilenceTimer();
      setSilenceLeft(100);           // reset visual bar on new speech
    }
  }, [transcript]);

  // ── Silence bar drain ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === PHASES.RECORDING) {
      setSilenceLeft(100);
      if (silenceIv.current) clearInterval(silenceIv.current);
      silenceIv.current = setInterval(() => {
        setSilenceLeft(p => Math.max(0, p - (100 / (SILENCE_MS / 100))));
      }, 100);
    } else {
      if (silenceIv.current) { clearInterval(silenceIv.current); silenceIv.current = null; }
    }
  }, [phase]);

  // ── Auto-scroll transcript panel ──────────────────────────────────────────
  useEffect(() => {
    if (transcriptEl.current) {
      transcriptEl.current.scrollTop = transcriptEl.current.scrollHeight;
    }
  }, [chatLog]);

  // ── STT error ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sttError === 'not-allowed') {
      setErrorMsg('Microphone access denied. Please allow it in browser settings and refresh.');
      setPhase(PHASES.ERROR);
    }
  }, [sttError]);

  // ── Session recovery on page refresh ─────────────────────────────────────
  useEffect(() => {
    const saved = loadSession();
    if (saved && saved.questions?.length > 0) {
      // Restore from localStorage
      const idx  = loadCurrentIndex();
      const qs: Question[] = saved.questions;
      const q = qs[idx];
      if (q) {
        setSessionId(saved.sessionId);
        setCurrentQ(q);
        setAnsweredCount(idx);
        setTotalQ(qs.length || 8);
        // Rebuild chat log from saved answers
        const allAnsSaved = loadAllAnswers(qs);
        const log: ChatMessage[] = [];
        qs.slice(0, idx + 1).forEach((qq, i) => {
          log.push({ role: 'interviewer', text: qq.question_text, questionNumber: i + 1 });
          const a = allAnsSaved[i];
          if (a && a.answerText !== '[No answer provided]') {
            log.push({ role: 'you', text: a.answerText });
          }
        });
        setChatLog(log);
        requestMic();
      }
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // CORE FLOW
  // ══════════════════════════════════════════════════════════════════════════

  /** Step 1 — Request mic then start interview */
  const requestMic = async () => {
    setPhase(PHASES.MIC_CHECK);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      startInterview();
    } catch {
      setErrorMsg('Microphone access denied. Please allow microphone and refresh.');
      setPhase(PHASES.ERROR);
    }
  };

  /** Step 2 — Call /start/ to create session and get first question */
  const startInterview = async () => {
    // If we already have a session+question (recovery), skip API call
    if (currentQRef.current && sessionIdRef.current) {
      askQuestion(currentQRef.current);
      return;
    }

    setPhase(PHASES.LOADING);
    try {
      const resp = await axios.post(
        `${BASE}/interview/start/`,
        {
          interview_type:  locState.interviewType || 'Mixed',
          resume_id:       locState.resumeId || null,
          total_questions: 8,
        },
        { headers: authHeader() }
      );

      const { session_id, current_question, total_questions } = resp.data;
      setSessionId(session_id);
      setTotalQ(total_questions || 8);
      saveSession(session_id, [current_question]);

      askQuestion(current_question);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Failed to start interview. Please try again.');
      setPhase(PHASES.ERROR);
    }
  };

  /** Step 3 — TTS speaks question, then opens mic */
  const askQuestion = useCallback(async (q: Question) => {
    setCurrentQ(q);
    resetTranscript();
    stopSilenceDetection();
    saveCurrentIndex(q.question_number - 1);

    // Add to chat log
    setChatLog(prev => [
      ...prev,
      { role: 'interviewer', text: q.question_text, questionNumber: q.question_number }
    ]);

    // Phase: TTS speaking
    setPhase(PHASES.SPEAKING);
    stopSpeaking();
    await speak(q.question_text);

    // Phase: 2-second countdown
    setPhase(PHASES.COUNTDOWN);
    setCountdown(2);
    await new Promise<void>(res => {
      let c = 2;
      const iv = setInterval(() => {
        c--;
        setCountdown(c);
        if (c <= 0) { clearInterval(iv); res(); }
      }, 1000);
    });

    // Phase: Recording
    setPhase(PHASES.RECORDING);
    startRecording();
    startSilenceDetection();
  }, [speak, stopSpeaking, startRecording, startSilenceDetection,
      stopSilenceDetection, resetTranscript, saveCurrentIndex]);

  /** Step 4 — User finishes speaking → send to /chat/ → get next question */
  const finalizeAnswer = useCallback(async () => {
    if (phaseRef.current !== PHASES.RECORDING) return;

    stopSilenceDetection();
    const answerText = stopRecording() || '[No answer provided]';
    const q = currentQRef.current!;

    // Save locally
    saveAnswer(q.id, q.question_text, q.category, answerText);
    setChatLog(prev => [...prev, { role: 'you', text: answerText }]);
    setAnsweredCount(prev => prev + 1);

    // Show processing state briefly
    setPhase(PHASES.PROCESSING);

    try {
      const resp = await axios.post(
        `${BASE}/interview/chat/`,
        {
          session_id:          sessionIdRef.current,
          answer_text:         answerText,
          question_number:     q.question_number,
          current_question_id: q.id,
        },
        { headers: authHeader() }
      );

      const { next_question, is_last } = resp.data;

      if (is_last || !next_question) {
        // All questions answered
        setIsLast(true);
        setPhase(PHASES.DONE);
        return;
      }

      setIsLast(is_last);

      // Small pause so "Processing..." is visible
      await new Promise(res => setTimeout(res, SAVE_FLASH_MS));

      // Ask next question
      askQuestion(next_question);

    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.error ||
        'Network error. Your answer was saved locally. Please check your connection.'
      );
      setPhase(PHASES.ERROR);
    }
  }, [stopRecording, stopSilenceDetection, saveAnswer, askQuestion]);

  // Wire silence callback
  onSilenceRef.current = finalizeAnswer;

  /** Manual "Next question" button — skip remaining speech */
  const handleNext = useCallback(() => {
    if (phaseRef.current === PHASES.RECORDING) {
      finalizeAnswer();
    } else if (phaseRef.current === PHASES.SPEAKING || phaseRef.current === PHASES.COUNTDOWN) {
      stopSpeaking();
      // Jump straight to recording
      setPhase(PHASES.RECORDING);
      startRecording();
      startSilenceDetection();
    }
  }, [finalizeAnswer, stopSpeaking, startRecording, startSilenceDetection]);

  /** "Try different question" — re-ask current question */
  const handleTryDifferent = useCallback(() => {
    stopSpeaking();
    stopSilenceDetection();
    stopRecording();
    if (currentQRef.current) askQuestion(currentQRef.current);
  }, [stopSpeaking, stopSilenceDetection, stopRecording, askQuestion]);

  /** Final submit — holistic Gemini evaluation */
  const handleSubmit = async () => {
    setPhase(PHASES.SUBMITTING);

    // Build answers list from localStorage
    const allQs = chatLog
      .filter(m => m.role === 'interviewer' && m.questionNumber)
      .map((m, i) => {
        const ans = chatLog.filter(x => x.role === 'you')[i];
        return {
          questionId:   `q_${m.questionNumber}`,
          questionText: m.text,
          questionType: 'general',
          answerText:   ans?.text || '[No answer]',
        };
      });

    try {
      const resp = await axios.post(
        `${BASE}/interview/submit-all/`,
        { session_id: sessionIdRef.current, answers: allQs },
        { headers: authHeader() }
      );
      clearSession([]);
      setResults(resp.data);
      navigate('/interview-results', { state: { results: resp.data, sessionId: sessionIdRef.current } });
    } catch (err: any) {
      setErrorMsg('Evaluation failed. Please try again.');
      setPhase(PHASES.ERROR);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  const progress = totalQ > 0 ? (answeredCount / totalQ) * 100 : 0;

  return (
    <div style={S.root}>
      {/* ── Transcript side panel ───────────────────────────────────────── */}
      {showTranscript && (
        <div style={S.panel}>
          <div style={S.panelHeader}>
            <div>
              <div style={S.panelTitle}>Interview Transcript</div>
              <div style={S.panelSub}>Real-time transcript of your conversation</div>
            </div>
            <button style={S.closeBtn} onClick={() => setShowTranscript(false)}>✕</button>
          </div>
          <div ref={transcriptEl} style={S.panelBody}>
            {chatLog.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'you' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                {msg.role === 'interviewer' && (
                  <div style={S.bubbleLabel}>Interviewer</div>
                )}
                <div style={msg.role === 'you' ? S.bubbleYou : S.bubbleInterviewer}>
                  {msg.role === 'you' && <div style={S.bubbleYouLabel}>You</div>}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main interview area ─────────────────────────────────────────── */}
      <div style={{ ...S.main, marginLeft: showTranscript ? 380 : 0 }}>

        {/* Progress bar — top */}
        {(phase !== PHASES.INIT && phase !== PHASES.MIC_CHECK && phase !== PHASES.LOADING) && (
          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${progress}%` }} />
          </div>
        )}

        {/* ── INIT / MIC_CHECK / LOADING screens ──────────────────────── */}
        {phase === PHASES.INIT && (
          <CenterCard>
            <div style={S.bigIcon}>🎤</div>
            <h2 style={S.cardH2}>Ready to Interview?</h2>
            <p style={S.cardP}>
              Your AI interviewer will ask questions based on your resume.<br />
              Answer each question naturally — like a real interview.
            </p>
            <div style={S.tagRow}>
              <span style={S.tag}>8 Questions</span>
              <span style={S.tag}>{locState.interviewType || 'Mixed'}</span>
              <span style={S.tag}>Voice-based</span>
            </div>
            <button style={S.startBtn} onClick={requestMic}>
              Start Interview
            </button>
          </CenterCard>
        )}

        {phase === PHASES.MIC_CHECK && (
          <CenterCard>
            <div style={S.bigIcon}>🎙️</div>
            <h2 style={S.cardH2}>Requesting Microphone Access</h2>
            <p style={S.cardP}>Please allow microphone access when your browser asks.</p>
            <Spinner />
          </CenterCard>
        )}

        {phase === PHASES.LOADING && (
          <CenterCard>
            <Spinner />
            <p style={{ ...S.cardP, marginTop: 20 }}>Preparing your personalized interview...</p>
          </CenterCard>
        )}

        {/* ── ACTIVE INTERVIEW PHASES ────────────────────────────────── */}
        {[PHASES.SPEAKING, PHASES.COUNTDOWN, PHASES.RECORDING,
          PHASES.PROCESSING, PHASES.DONE].includes(phase) && currentQ && (
          <div style={S.interviewLayout}>

            {/* Question number + category badge */}
            <div style={S.qMeta}>
              <span style={S.qNum}>Question {currentQ.question_number} of {totalQ}</span>
              <span style={{ ...S.catBadge, background: categoryColor(currentQ.category) + '22', color: categoryColor(currentQ.category), border: `1px solid ${categoryColor(currentQ.category)}44` }}>
                {categoryLabel(currentQ.category)}
              </span>
            </div>

            {/* Question text */}
            <div style={S.questionWrapper}>
              <div style={S.questionLabel}>The interviewer asks...</div>
              <div style={S.questionText}>{currentQ.question_text}</div>
            </div>

            {/* Animated orb — the centerpiece */}
            <div style={S.orbWrapper}>
              <OrbVisual phase={phase} />
            </div>

            {/* Live transcript while recording */}
            {phase === PHASES.RECORDING && (
              <div style={S.transcriptBox}>
                <span style={transcript ? S.transcriptText : S.transcriptPlaceholder}>
                  {transcript || 'Start speaking...'}
                </span>
              </div>
            )}

            {/* Silence bar */}
            {phase === PHASES.RECORDING && (
              <div style={S.silenceTrack}>
                <div
                  style={{
                    ...S.silenceFill,
                    width: `${silenceLeft}%`,
                    background: silenceLeft < 30 ? '#ef4444' : silenceLeft < 60 ? '#f97316' : '#22c55e',
                    transition: 'width 0.1s linear, background 0.3s',
                  }}
                />
              </div>
            )}

            {/* Processing state */}
            {phase === PHASES.PROCESSING && (
              <div style={S.processingText}>
                <Spinner small /> Analyzing your answer...
              </div>
            )}

            {/* Done state */}
            {phase === PHASES.DONE && (
              <div style={{ textAlign: 'center' }}>
                <div style={S.doneIcon}>✓</div>
                <div style={S.doneText}>All questions answered!</div>
                <p style={S.doneSubtext}>Review your answers before submitting for AI evaluation.</p>
              </div>
            )}
          </div>
        )}

        {/* ── SUBMITTING ─────────────────────────────────────────────── */}
        {phase === PHASES.SUBMITTING && (
          <CenterCard>
            <Spinner />
            <p style={{ ...S.cardP, marginTop: 20 }}>
              AI is evaluating your complete interview...<br />
              <span style={{ fontSize: 13, opacity: 0.5 }}>This usually takes 15-30 seconds</span>
            </p>
          </CenterCard>
        )}

        {/* ── ERROR ──────────────────────────────────────────────────── */}
        {phase === PHASES.ERROR && (
          <CenterCard>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <h2 style={S.cardH2}>Something went wrong</h2>
            <p style={S.cardP}>{errorMsg}</p>
            <button style={S.startBtn} onClick={() => { setPhase(PHASES.INIT); setErrorMsg(''); }}>
              Try Again
            </button>
          </CenterCard>
        )}

        {/* ── BOTTOM BAR ─────────────────────────────────────────────── */}
        <div style={S.bottomBar}>
          {/* Timer (left) */}
          <div style={S.timerPill}>
            <span style={{ marginRight: 6 }}>⏱</span>
            {formatTime(elapsed)}
          </div>

          {/* Action buttons (center) */}
          <div style={S.bottomCenter}>
            {[PHASES.SPEAKING, PHASES.COUNTDOWN, PHASES.RECORDING].includes(phase) && (
              <button style={S.ghostBtn} onClick={handleTryDifferent}>
                Try a different question
              </button>
            )}
            {phase === PHASES.RECORDING && (
              <button style={S.nextBtn} onClick={handleNext}>
                Submit answer →
              </button>
            )}
            {phase === PHASES.DONE && (
              <button style={S.submitBtn} onClick={handleSubmit}>
                Submit interview
              </button>
            )}
          </div>

          {/* Transcript toggle (right) */}
          <button style={S.transcriptBtn} onClick={() => setShowTranscript(v => !v)}>
            📋 Transcript {chatLog.length > 0 && `(${chatLog.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        textAlign: 'center', maxWidth: 520, padding: '0 24px',
      }}>
        {children}
      </div>
    </div>
  );
}

function OrbVisual({ phase }: { phase: Phase }) {
  const isRecording  = phase === PHASES.RECORDING;
  const isSpeaking   = phase === PHASES.SPEAKING;
  const isCountdown  = phase === PHASES.COUNTDOWN;
  const isProcessing = phase === PHASES.PROCESSING;

  // Orb color per phase
  const orbColor = isRecording
    ? '#7c3aed'
    : isSpeaking
    ? '#3b82f6'
    : isCountdown
    ? '#f97316'
    : isProcessing
    ? '#22c55e'
    : '#374151';

  return (
    <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Pulse rings — only when recording */}
      {isRecording && (
        <>
          <div style={{ ...S.ring, animationDelay: '0s',    width: 120, height: 120, border: `2px solid ${orbColor}66` }} />
          <div style={{ ...S.ring, animationDelay: '0.5s',  width: 150, height: 150, border: `1.5px solid ${orbColor}44` }} />
          <div style={{ ...S.ring, animationDelay: '1s',    width: 180, height: 180, border: `1px solid ${orbColor}22` }} />
        </>
      )}
      {/* Orb */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: orbColor,
        boxShadow: `0 0 30px ${orbColor}66, 0 0 60px ${orbColor}33`,
        transition: 'background 0.4s, box-shadow 0.4s',
        animation: isSpeaking ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }} />

      {/* Phase icon inside orb */}
      <div style={{
        position: 'absolute', fontSize: 26, pointerEvents: 'none',
        animation: isCountdown ? 'none' : undefined,
      }}>
        {isSpeaking   && '🔊'}
        {isCountdown  && <span style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>
          {/* countdown number shown via state */}
        </span>}
        {isRecording  && '🎙'}
        {isProcessing && '⚙️'}
      </div>
    </div>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  const size = small ? 16 : 40;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `${small ? 2 : 3}px solid #ffffff22`,
      borderTopColor: '#7c3aed',
      animation: 'spin 0.8s linear infinite',
      display: 'inline-block',
      verticalAlign: 'middle',
    }} />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', height: '100vh', overflow: 'hidden',
    background: '#080d1a', color: '#e2e8f0',
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
  },

  // Transcript panel
  panel: {
    position: 'fixed', left: 0, top: 0, bottom: 0, width: 380, zIndex: 20,
    background: '#0f1623', borderRight: '1px solid #1e2d45',
    display: 'flex', flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 20px 16px', borderBottom: '1px solid #1e2d45',
  },
  panelTitle:  { fontSize: 15, fontWeight: 600, color: '#f1f5f9' },
  panelSub:    { fontSize: 12, color: '#64748b', marginTop: 3 },
  closeBtn: {
    background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
    fontSize: 16, padding: '2px 6px', lineHeight: 1,
  },
  panelBody: {
    flex: 1, overflowY: 'auto', padding: '16px 16px',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  bubbleLabel: {
    fontSize: 10, color: '#64748b', marginBottom: 4, alignSelf: 'flex-start',
    marginLeft: 2, textTransform: 'uppercase', letterSpacing: 1,
  },
  bubbleInterviewer: {
    background: '#1e2d45', color: '#cbd5e1', borderRadius: '4px 16px 16px 16px',
    padding: '10px 14px', fontSize: 13, lineHeight: 1.5, maxWidth: 280,
  },
  bubbleYou: {
    background: '#3b82f6', color: '#fff', borderRadius: '16px 4px 16px 16px',
    padding: '10px 14px', fontSize: 13, lineHeight: 1.5, maxWidth: 280,
  },
  bubbleYouLabel: {
    fontSize: 10, opacity: 0.7, marginBottom: 3,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // Main area
  main: {
    flex: 1, display: 'flex', flexDirection: 'column',
    transition: 'margin-left 0.3s ease',
    position: 'relative',
  },

  progressBar: {
    height: 2, background: '#1e2d45', flexShrink: 0,
  },
  progressFill: {
    height: '100%', background: '#7c3aed',
    transition: 'width 0.5s ease',
  },

  interviewLayout: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '24px 32px', gap: 20,
  },

  qMeta: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  qNum: { fontSize: 13, color: '#64748b', letterSpacing: 0.5 },
  catBadge: {
    fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  questionWrapper: { textAlign: 'center', maxWidth: 680 },
  questionLabel:   { fontSize: 13, color: '#64748b', marginBottom: 12, letterSpacing: 0.3 },
  questionText: {
    fontSize: 28, fontWeight: 700, lineHeight: 1.35, color: '#f1f5f9',
    fontFamily: "'DM Serif Display', Georgia, serif",
  },

  orbWrapper: {
    marginTop: 8, marginBottom: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute', borderRadius: '50%',
    animation: 'ripple 2s ease-out infinite',
  },

  transcriptBox: {
    background: '#0f1623', border: '1px solid #1e2d45',
    borderRadius: 12, padding: '14px 18px',
    maxWidth: 560, width: '100%',
    minHeight: 56, fontSize: 14, lineHeight: 1.6,
  },
  transcriptText:        { color: '#cbd5e1' },
  transcriptPlaceholder: { color: '#475569', fontStyle: 'italic' },

  silenceTrack: {
    width: '100%', maxWidth: 400, height: 3, borderRadius: 2,
    background: '#1e2d45', overflow: 'hidden',
  },
  silenceFill: { height: '100%', borderRadius: 2 },

  processingText: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 14, color: '#94a3b8',
  },

  doneIcon:    { fontSize: 56, lineHeight: 1, marginBottom: 12 },
  doneText:    { fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
  doneSubtext: { fontSize: 14, color: '#64748b' },

  // Cards
  bigIcon:  { fontSize: 52, marginBottom: 16 },
  cardH2:   { fontSize: 24, fontWeight: 700, color: '#f1f5f9', marginBottom: 10 },
  cardP:    { fontSize: 15, color: '#94a3b8', lineHeight: 1.6, marginBottom: 24 },
  tagRow:   { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' },
  tag: {
    fontSize: 12, padding: '4px 12px', borderRadius: 100,
    background: '#1e2d45', color: '#94a3b8', border: '1px solid #2d3f5a',
  },

  startBtn: {
    background: '#7c3aed', color: '#fff', border: 'none',
    padding: '14px 36px', borderRadius: 100,
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 0 20px #7c3aed44',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },

  // Bottom bar
  bottomBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', borderTop: '1px solid #1e2d4540',
    flexShrink: 0,
  },
  timerPill: {
    display: 'flex', alignItems: 'center',
    background: '#0f1623', border: '1px solid #1e2d45',
    borderRadius: 100, padding: '6px 14px',
    fontSize: 13, fontFamily: 'monospace', color: '#94a3b8',
  },
  bottomCenter: { display: 'flex', gap: 12, alignItems: 'center' },

  ghostBtn: {
    background: 'none', border: '1px solid #2d3f5a',
    color: '#94a3b8', padding: '10px 20px', borderRadius: 100,
    fontSize: 14, cursor: 'pointer',
  },
  nextBtn: {
    background: '#7c3aed', color: '#fff', border: 'none',
    padding: '10px 24px', borderRadius: 100,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 0 16px #7c3aed33',
  },
  submitBtn: {
    background: '#7c3aed', color: '#fff', border: 'none',
    padding: '12px 32px', borderRadius: 100,
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 0 24px #7c3aed44', animation: 'pulse 2s ease-in-out infinite',
  },
  transcriptBtn: {
    background: '#0f1623', border: '1px solid #1e2d45',
    color: '#94a3b8', padding: '8px 16px', borderRadius: 100,
    fontSize: 13, cursor: 'pointer',
  },
};

// ── CSS Animations (inject once) ──────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('iv-anim')) {
  const style = document.createElement('style');
  style.id = 'iv-anim';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');

    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes pulse   { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.85; transform:scale(1.04); } }
    @keyframes ripple  {
      0%   { transform: scale(0.8); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0;   }
    }
  `;
  document.head.appendChild(style);
}

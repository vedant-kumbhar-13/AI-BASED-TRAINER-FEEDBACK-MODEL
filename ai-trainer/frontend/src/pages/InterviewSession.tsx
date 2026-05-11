/**
 * InterviewSessionPage
 *
 * Two-step backend flow:
 *   1. POST /api/interview/start/  → { session_id, questions:[{id,order,text,type}] }
 *   2. POST /api/interview/submit-all/ → full evaluation
 *
 * Voice input now uses Cloud STT (MediaRecorder → backend transcription).
 * No API key required — works in Chrome, Edge, and other Chromium browsers.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Navigation } from '../components/dashboard/Navigation';
import {
  Send, Mic, MicOff, Clock, Loader2, SkipForward, X, Volume2, VolumeX,
  CheckCircle, ChevronRight, Edit3
} from 'lucide-react';
import AuthService from '../services/authService';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/api$/, '');

// Module-level helper — user-scoped localStorage key (C3 + I4 fix)
const getStorageKey = (userId: string | number) =>
  `interview_session_backup_${userId}`;


// ── Types ────────────────────────────────────────────────────────────────────
interface Question {
  id: string;
  order: number;
  text: string;
  type: string;
}

interface CollectedAnswer {
  questionId: string;
  questionText: string;
  questionType: string;
  answerText: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...AuthService.getAuthHeaders(),
  };
}

async function apiPost(url: string, body: object) {
  const res = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server error (HTTP ${res.status}). Please try again.`);
  }
  if (!res.ok) throw new Error(json.error || json.detail || `HTTP ${res.status}`);
  return json;
}


// ── Phase type ────────────────────────────────────────────────────────────────
type Phase = 'loading' | 'answering' | 'review' | 'submitting' | 'done' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
export const InterviewSessionPage = () => {
  const navigate  = useNavigate();
  const location  = useLocation();

  // Config passed from ResumeSummary / AIInterviewLanding
  const config = location.state?.config || { interviewType: 'Technical', numQuestions: 8 };
  const resume = location.state?.resume;

  // ── State ────────────────────────────────────────────────────────────────
  const [phase,            setPhase]            = useState<Phase>('loading');
  const [sessionId,        setSessionId]        = useState('');
  const [questions,        setQuestions]        = useState<Question[]>([]);
  const [currentIdx,       setCurrentIdx]       = useState(0);
  const [currentAnswer,    setCurrentAnswer]    = useState('');
  const [collectedAnswers, setCollectedAnswers] = useState<CollectedAnswer[]>([]);
  const [timer,            setTimer]            = useState(0);
  const [error,            setError]            = useState('');

  // TTS
  const [isSpeaking,  setIsSpeaking]  = useState(false);
  const [ttsEnabled,  setTtsEnabled]  = useState(true);

  // User-scoped localStorage key (C3 fix)
  const currentUser = AuthService.getUser();
  const STORAGE_KEY = getStorageKey(currentUser?.id ?? 'anon');

  // Cloud STT recording state
  const [isRecording,    setIsRecording]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTimer, setRecordingTimer] = useState(0);   // seconds elapsed while recording
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<BlobPart[]>([]);
  const audioPlayerRef    = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionIdAtRecordRef = useRef<string | null>(null); // C1 fix: snapshot question ID at record-stop
  const navigatingRef = useRef(false); // Bug fix: prevents stale TTS onended from auto-starting recording
  const MAX_RECORDING_SECS = 55; // auto-stop before Cloud STT 60s limit
  // Read input mode from navigation state (set on AIInterviewLanding)
  const inputMode = (location.state?.inputMode as 'voice' | 'text') || 'voice';

  const currentQuestion = questions[currentIdx] || null;

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'answering') return;
    const id = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase, currentIdx]);

  // ── Recording countdown: auto-stop at MAX_RECORDING_SECS ────────────────
  useEffect(() => {
    if (isRecording) {
      setRecordingTimer(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTimer(prev => {
          if (prev + 1 >= MAX_RECORDING_SECS) {
            // Auto-stop recording
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop();
              setIsRecording(false);
            }
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
      return () => {
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };
    } else {
      setRecordingTimer(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  }, [isRecording]);

  // ── BUG-09: Persist session to localStorage whenever answers/index change ──
  useEffect(() => {
    if (phase === 'answering' && sessionId && questions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId, questions, currentIdx, collectedAnswers,
      }));
    }
  }, [collectedAnswers, currentIdx, sessionId, questions, phase]);

  const clearSessionBackup = () => localStorage.removeItem(STORAGE_KEY);

  // ── Mount: start interview + pre-load TTS voices ─────────────────────────
  useEffect(() => {
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    // If user came from interview setup flow (fresh start), always clear old backup
    const isFreshStart = !!(location.state?.config || location.state?.resume);
    if (isFreshStart) {
      clearSessionBackup();
      startInterview();
      return () => {
        window.speechSynthesis?.cancel();
        audioPlayerRef.current?.pause();
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };
    }

    // Otherwise try restoring a backup (user resumed by navigating directly)
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const backup = JSON.parse(saved);
        if (backup.sessionId && backup.questions?.length > 0) {
          setSessionId(backup.sessionId);
          setQuestions(backup.questions);
          setCurrentIdx(backup.currentIdx || 0);
          setCollectedAnswers(backup.collectedAnswers || []);
          setCurrentAnswer('');
          setPhase('answering');
          return;
        }
      } catch { /* corrupted — fall through to fresh start */ }
    }

    startInterview();
    return () => {
      window.speechSynthesis?.cancel();
      audioPlayerRef.current?.pause();
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // ── Cloud STT — MediaRecorder → background transcription ───────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      // Snapshot the question ID NOW (at recording start) so it's never null for Q1
      questionIdAtRecordRef.current = currentQuestion?.id ?? null;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        sendAudioForTranscription();
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setError('');
    } catch (err: any) {
      setError(err.name === 'NotAllowedError'
        ? 'Microphone access denied. Allow mic access in browser settings.'
        : 'Could not access microphone.');
    }
  }, [currentQuestion]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const sendAudioForTranscription = useCallback(async () => {
    if (!audioChunksRef.current.length) return;
    const snapshotQId = questionIdAtRecordRef.current; // C1 fix: capture question context
    setIsTranscribing(true);
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      const formData = new FormData();
      formData.append('audio', blob, 'answer.webm');
      const res = await fetch(`${API_BASE}/api/interview/transcribe/`, {
        method: 'POST',
        headers: AuthService.getAuthHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.text) {
        // C1 fix: only apply transcript if we're still on the same question
        if (snapshotQId && questions[currentIdx]?.id !== snapshotQId) {
          console.warn('[STT] Discarding late transcript — question already changed');
        } else {
          setCurrentAnswer(prev => prev.trim() ? `${prev.trim()} ${data.text}` : data.text);
        }
      } else if (!res.ok) { setError(`Transcription error: ${data.error || 'Unknown error'}`); }
    } catch { setError('Transcription failed. Check connection and try again.'); }
    finally { setIsTranscribing(false); }
  }, [questions, currentIdx]);

  // ── Auto-read question when it changes ───────────────────────────────────
  useEffect(() => {
    if (phase === 'answering' && ttsEnabled && currentQuestion) {
      speakText(`Question ${currentIdx + 1}. ${currentQuestion.text}`);
    }
  }, [currentIdx, phase]);

  // ── TTS (Cloud TTS with browser fallback) ── M4 fix: wrapped in useCallback
  const speakText = useCallback(async (text: string) => {
    if (!ttsEnabled || !text) return;
    setIsSpeaking(true);
    try {
      const token = AuthService.getAuthHeaders();
      const res = await fetch(`${API_BASE}/api/interview/tts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...token },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('TTS API failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      audio.playbackRate = 1.0;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
        // Only auto-start recording if we haven't navigated away from this question
        if (inputMode === 'voice' && !navigatingRef.current) setTimeout(() => startRecording(), 500);
      };
      audio.onerror = () => { URL.revokeObjectURL(url); setIsSpeaking(false); };
      await audio.play();
    } catch (err) {
      console.warn('Cloud TTS failed, falling back to browser TTS', err);
      // Graceful fallback to browser SpeechSynthesis
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.rate = 0.9;
        utt.onend = () => { setIsSpeaking(false); if (inputMode === 'voice' && !navigatingRef.current) setTimeout(() => startRecording(), 500); };
        utt.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utt);
      } else { setIsSpeaking(false); }
    }
  }, [ttsEnabled, inputMode, startRecording]);

  const stopSpeaking = () => {
    audioPlayerRef.current?.pause();
    audioPlayerRef.current = null;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  const toggleTts = () => { if (isSpeaking) stopSpeaking(); setTtsEnabled(prev => !prev); };

  // ── Start Interview ───────────────────────────────────────────────────────
  const startInterview = async () => {
    setPhase('loading');
    setError('');
    try {
      const data = await apiPost(`${API_BASE}/api/interview/start/`, {
        resume_id:       resume?.id ?? null,
        interview_type:  config.interviewType,
        total_questions: config.numQuestions || 8,
      });
      setSessionId(data.session_id);
      setQuestions(data.questions);
      setCurrentIdx(0);
      setTimer(0);
      setCollectedAnswers([]);
      setCurrentAnswer('');
      setPhase('answering');
    } catch (err: any) {
      setError(err.message || 'Failed to start interview. Please try again.');
      setPhase('error');
    }
  };

  // ── Save & navigate questions ─────────────────────────────────────────────
  const saveCurrentAnswer = () => {
    if (!currentQuestion) return;
    const answer: CollectedAnswer = {
      questionId:   currentQuestion.id,
      questionText: currentQuestion.text,
      questionType: currentQuestion.type,
      answerText:   currentAnswer.trim() || '[No answer provided]',
    };
    setCollectedAnswers(prev => {
      const updated = [...prev];
      updated[currentIdx] = answer;
      return updated;
    });
  };

  const handleNextQuestion = () => {
    // Set navigating flag FIRST to block stale TTS onended from auto-starting recording
    navigatingRef.current = true;
    stopSpeaking();
    if (isRecording) stopRecording();
    saveCurrentAnswer();
    if (currentIdx + 1 >= questions.length) {
      navigatingRef.current = false;
      setPhase('review');
    } else {
      setCurrentIdx(prev => prev + 1);
      setCurrentAnswer('');
      setTimer(0);
      // Reset flag after a short delay so the NEXT question's TTS can auto-start recording
      setTimeout(() => { navigatingRef.current = false; }, 800);
    }
  };

  // C2 fix: confirmation state for exit modal (I2)
  const [showExitModal, setShowExitModal] = useState(false);


  const handleSkipQuestion = () => {
    // Mark as skipped (distinct from '[No answer provided]' for unattempted questions)
    setCurrentAnswer('[Skipped]');
    // Save immediately with skipped marker before navigating
    if (currentQuestion) {
      setCollectedAnswers(prev => {
        const updated = [...prev];
        updated[currentIdx] = {
          questionId: currentQuestion.id,
          questionText: currentQuestion.text,
          questionType: currentQuestion.type,
          answerText: '[Skipped]',
        };
        return updated;
      });
    }
    handleNextQuestion();
  };

  const handleGoToQuestion = (idx: number) => {
    if (isRecording) stopRecording();
    const saved = collectedAnswers[idx];
    setCurrentIdx(idx);
    setCurrentAnswer(
      saved && saved.answerText !== '[No answer provided]' ? saved.answerText : ''
    );
    setTimer(0);
    setPhase('answering');
  };

  // ── Final submit ──────────────────────────────────────────────────────────
  const handleSubmitAll = async () => {
    setPhase('submitting');
    try {
      const evaluation = await apiPost(`${API_BASE}/api/interview/submit-all/`, {
        session_id: sessionId,
        answers:    collectedAnswers,
      });
      clearSessionBackup(); // BUG-09: clear saved session on successful submit
      navigate('/ai-interview-feedback', { state: { evaluation, sessionId } });
    } catch (err: any) {
      setError(err.message || 'Submission failed. Please try again.');
      setPhase('review');
    }
  };

  const handleExitInterview = () => {
    stopSpeaking();
    if (isRecording) stopRecording();
    setShowExitModal(true);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─────────────────────────── RENDER ──────────────────────────────────────

  // Loading
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-16 flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Generating Your Questions…</h2>
            <p className="text-gray-500">AI is personalising {config.numQuestions || 8} questions from your profile</p>
          </div>
        </main>
      </div>
    );
  }

  // Error
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-16 flex items-center justify-center min-h-[80vh]">
          <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md w-full text-center mx-4">
            <span className="text-5xl mb-4 block">⚠️</span>
            <h2 className="text-xl font-bold text-gray-800 mb-3">Something went wrong</h2>
            <p className="text-gray-500 mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={startInterview}
                className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl transition">
                🔄 Try Again
              </button>
              <button onClick={() => navigate('/ai-interview')}
                className="px-6 py-3 border-2 border-gray-300 text-gray-600 font-bold rounded-xl hover:border-gray-400 transition">
                Cancel
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Submitting
  if (phase === 'submitting') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-16 flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Analysing Your Interview…</h2>
            <p className="text-gray-500">This takes 20–30 seconds. Please wait.</p>
          </div>
        </main>
      </div>
    );
  }

  // Review screen — professional layout matching feedback page
  if (phase === 'review') {
    const answeredCount = collectedAnswers.filter(a => a && a.answerText !== '[No answer provided]' && a.answerText !== '[Skipped]').length;
    const skippedCount = collectedAnswers.filter(a => a && a.answerText === '[Skipped]').length;
    const noResponseCount = questions.length - collectedAnswers.filter(a => !!a).length;

    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-16">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {/* Header card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-6 shadow-card text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-100 to-white border-4 border-green-400 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-1">Review Your Answers</h2>
              <p className="text-gray-500 text-sm mb-4">Review and edit any answer before final submission</p>
              <div className="flex justify-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{answeredCount}</p>
                  <p className="text-xs text-gray-500">Answered</p>
                </div>
                <div className="w-px bg-gray-200" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-400">{skippedCount}</p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
                {noResponseCount > 0 && (
                  <>
                    <div className="w-px bg-gray-200" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-400">{noResponseCount}</p>
                      <p className="text-xs text-gray-500">No Response</p>
                    </div>
                  </>
                )}
                <div className="w-px bg-gray-200" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary">{questions.length}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
              </div>
            </div>

            {/* Question list */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-card mb-6">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-bold text-gray-800 text-sm">Question-by-Question Review</h3>
              </div>
              {questions.map((q, idx) => {
                const ans = collectedAnswers[idx];
                const answered = ans && ans.answerText !== '[No answer provided]' && ans.answerText !== '[Skipped]';
                const answerPreview = answered
                  ? (ans.answerText.length > 120 ? ans.answerText.slice(0, 120) + '\u2026' : ans.answerText)
                  : null;
                return (
                  <div key={q.id} className="border-b border-gray-100 last:border-0">
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-light text-primary font-bold flex items-center justify-center text-sm">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-400 uppercase">{q.type}</span>
                              {answered ? (
                                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{'\u2713'} Answered</span>
                              ) : ans?.answerText === '[Skipped]' ? (
                                <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">{'\u23ED'} Skipped</span>
                              ) : (
                                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{'\u2014'} Not answered</span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-gray-800 mb-1">{q.text}</p>
                            {answerPreview && (
                              <p className="text-sm text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100 mt-2">
                                {answerPreview}
                              </p>
                            )}
                          </div>
                        </div>
                        <button onClick={() => handleGoToQuestion(idx)}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border border-primary text-primary text-xs font-bold rounded-lg hover:bg-primary-light transition">
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {error && <p className="text-red-500 text-center mb-4">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={handleSubmitAll}
                className="px-8 py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl shadow-button transition flex items-center justify-center gap-2">
                <Send className="w-5 h-5" /> Submit Interview
              </button>
              <button onClick={() => navigate('/ai-interview')}
                className="px-8 py-4 border-2 border-gray-300 text-gray-600 font-bold rounded-xl hover:border-gray-400 transition">
                Cancel
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Main answering screen ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-6 py-8">

          {/* Header bar */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-primary text-white text-sm font-bold rounded-full">
                {config.interviewType}
              </span>
              <span className="text-gray-500 text-sm">
                Question {currentIdx + 1} of {questions.length}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-gray-600 font-mono font-bold">
                <Clock className="w-4 h-4" />
                {formatTime(timer)}
              </div>
              <button onClick={handleExitInterview}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition"
                title="Exit interview">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-8">
            {questions.map((_, i) => {
              const done    = i < currentIdx;
              const current = i === currentIdx;
              return (
                <div key={i}
                  className={`h-2.5 rounded-full transition-all ${
                    done    ? 'bg-green-500 w-2.5'
                    : current ? 'bg-primary w-8'
                    : 'bg-gray-300 w-2.5'
                  }`}
                />
              );
            })}
          </div>

          {/* Question card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden mb-4">

            {/* Question section */}
            <div className="p-7 border-b border-gray-100 bg-gray-50">
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-primary-light to-white border-2 border-primary flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-xs text-gray-400 font-medium">AI Interviewer</p>
                    {/* Replay button */}
                    <button
                      onClick={() => speakText(currentQuestion?.text || '')}
                      disabled={isSpeaking}
                      title="Read question aloud"
                      className={`p-1 rounded-full transition-all text-sm ${
                        isSpeaking
                          ? 'bg-primary text-white animate-pulse'
                          : 'hover:bg-gray-200 text-gray-400'
                      }`}>
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    {/* Toggle auto-read */}
                    <button
                      onClick={toggleTts}
                      title={ttsEnabled ? 'Disable auto-read' : 'Enable auto-read'}
                      className={`p-1 rounded-full hover:bg-gray-200 transition-all text-sm ${
                        ttsEnabled ? 'text-gray-400' : 'text-red-400'
                      }`}>
                      {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-base text-gray-800 leading-relaxed">
                    {currentQuestion?.text || 'Loading…'}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">Type: {currentQuestion?.type || '—'}</p>
                </div>
              </div>
            </div>

            {/* Answer section */}
            <div className="p-7">
              {/* Recording controls — voice mode only */}
              {inputMode === 'voice' && (
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <span className="text-sm font-bold text-gray-700">Your Response</span>
                  {!isRecording && (
                    <button onClick={startRecording} disabled={isSpeaking}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-full hover:bg-primary-dark transition disabled:opacity-40">
                      <Mic className="w-4 h-4" /> Record Answer
                    </button>
                  )}
                  {isRecording && (
                    <button onClick={stopRecording}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-full hover:bg-red-600 transition animate-pulse">
                      <MicOff className="w-4 h-4" /> Stop Recording
                    </button>
                  )}
                  {isRecording && (
                    <span className="flex items-center gap-2">
                      <span className="flex items-end gap-0.5 h-5">
                        {[1,2,3,4,5].map(i => <span key={i} className="w-1 bg-red-500 rounded-full"
                          style={{ height: `${8+(i%3)*6}px`, animation:`pulse 0.${6+i}s ease-in-out infinite alternate` }} />)}
                      </span>
                      <span className="text-xs text-red-500 font-mono font-bold">
                        {MAX_RECORDING_SECS - recordingTimer}s left
                      </span>
                      {recordingTimer >= MAX_RECORDING_SECS - 10 && (
                        <span className="text-xs text-red-600 font-medium animate-pulse">Auto-stop soon</span>
                      )}
                    </span>
                  )}
                  {isTranscribing && !isRecording && (
                    <span className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                      <Loader2 className="w-3 h-3 animate-spin" /> Transcribing in background…
                    </span>
                  )}
                </div>
              )}
              {inputMode === 'text' && (
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-bold text-gray-700">Your Response</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">⌨️ Text mode</span>
                </div>
              )}
              <textarea
                value={currentAnswer}
                onChange={e => setCurrentAnswer(e.target.value)}
                disabled={isRecording}
                placeholder={inputMode === 'voice'
                  ? (isRecording ? 'Recording — click Stop when finished'
                     : isTranscribing ? 'Transcribing… you can start typing here while you wait.'
                     : 'Click Record Answer, speak, then click Stop. You can edit the text too.')
                  : 'Type your answer here…'}
                rows={6}
                className={`w-full p-4 border rounded-xl resize-none text-gray-800 placeholder-gray-400 transition-all ${
                  isRecording ? 'border-red-300 bg-red-50 cursor-not-allowed'
                  : isTranscribing ? 'border-blue-200 bg-blue-50/30'
                  : 'border-gray-300 focus:border-primary focus:ring-1 focus:ring-primary'
                }`}
              />
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              <div className="flex justify-between items-center mt-4">
                <span className="text-xs text-gray-400">{currentAnswer.length} characters</span>
                <div className="flex gap-3">
                  <button onClick={handleSkipQuestion}
                    className="flex items-center gap-1.5 px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition">
                    <SkipForward className="w-4 h-4" /> Skip
                  </button>
                  <button onClick={handleNextQuestion} disabled={isRecording || isTranscribing}
                    className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl shadow-button flex items-center gap-2 transition-all disabled:opacity-50">
                    {isTranscribing
                      ? <><Loader2 className="w-5 h-5 animate-spin" /> Transcribing…</>
                      : currentIdx + 1 >= questions.length
                        ? <><CheckCircle className="w-5 h-5" /> Review Answers</>
                        : <><ChevronRight className="w-5 h-5" /> Next Question</>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tip */}
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-sm text-blue-700">
              {inputMode === 'voice'
                ? '💡 Click Record Answer and speak. Click Stop when done — AI transcribes it. Edit the text if needed before moving on.'
                : '💡 Type your answer in the box above. Click Next Question when ready.'}
            </p>
          </div>

        </div>

          {/* Exit confirmation modal (replaces window.confirm — I2 fix) */}
          {showExitModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full mx-4 shadow-xl">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Exit Interview?</h3>
                <p className="text-gray-500 text-sm mb-6">
                  Your progress will be saved and can be resumed when you return.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowExitModal(false)}
                    className="px-5 py-2.5 border-2 border-gray-300 text-gray-600 font-bold rounded-xl hover:border-gray-400 transition"
                  >
                    Resume Interview
                  </button>
                  <button
                    onClick={() => { setShowExitModal(false); navigate('/ai-interview'); }}
                    className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition"
                  >
                    Exit & Save
                  </button>
                </div>
              </div>
            </div>
          )}
      </main>
    </div>
  );
};

export default InterviewSessionPage;

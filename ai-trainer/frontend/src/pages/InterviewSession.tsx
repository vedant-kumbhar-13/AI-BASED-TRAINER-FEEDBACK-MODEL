/**
 * InterviewSessionPage
 *
 * Two-step backend flow:
 *   1. POST /api/interview/start/  → { session_id, questions:[{id,order,text,type}] }
 *   2. POST /api/interview/submit-all/ → full evaluation
 *
 * Voice input uses the browser-native Web Speech API (SpeechRecognition).
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

// ── TypeScript shim for Web Speech API ───────────────────────────────────────
declare const webkitSpeechRecognition: any;
declare const SpeechRecognition: any;

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

// Check if browser supports Web Speech API
const speechSupported =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

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

  // Web Speech API (STT)
  const [isListening,    setIsListening]    = useState(false);
  const [interimText,    setInterimText]    = useState('');
  const recognitionRef = useRef<any>(null);

  // BUG-08: Silence detection — auto-advance after 3s of no speech
  const silenceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SILENCE_TIMEOUT  = 3000; // 3 seconds

  // BUG-09: localStorage key for session persistence
  const STORAGE_KEY = 'interview_session_backup';

  const currentQuestion = questions[currentIdx] || null;

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'answering') return;
    const id = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase, currentIdx]);

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
    // Pre-load voices so they are available when the first question plays.
    // Chrome populates getVoices() asynchronously; registering onvoiceschanged
    // forces it to load immediately rather than returning [] on first call.
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices(); // just trigger population
      };
    }

    // BUG-09: Try restoring from localStorage before starting a fresh interview
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
          return; // skip startInterview()
        }
      } catch { /* corrupted — fall through to fresh start */ }
    }

    startInterview();
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const intentionalStopRef = useRef(false);

  // ── Web Speech API (STT) ──────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!speechSupported) {
      setError('Voice input is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    // Stop any existing recognition session
    intentionalStopRef.current = true;
    recognitionRef.current?.stop();
    intentionalStopRef.current = false;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous      = true;   // keep running until stopped
    recognition.interimResults  = true;   // show partial results in real time
    recognition.lang            = 'en-IN'; // Indian English accent
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
      setError('');
    };

    recognition.onresult = (event: any) => {
      let finalChunk  = '';
      let interimChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += transcript + ' ';
        } else {
          interimChunk += transcript;
        }
      }

      if (finalChunk) {
        setCurrentAnswer(prev =>
          prev.trim() ? `${prev.trim()} ${finalChunk.trim()}` : finalChunk.trim()
        );
      }
      setInterimText(interimChunk);

      // BUG-08: Reset silence timer on every speech result
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (finalChunk || interimChunk) {
        silenceTimerRef.current = setTimeout(() => {
          // 3s of silence after speech — auto-advance
          intentionalStopRef.current = true;
          recognitionRef.current?.stop();
          // Use a small delay so the last final result is captured
          setTimeout(() => handleNextQuestionRef.current(), 200);
        }, SILENCE_TIMEOUT);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please allow mic access in your browser settings.');
        intentionalStopRef.current = true;
      } else if (event.error !== 'no-speech') {
        console.error("Voice Error", event);
        // Do not interrupt the user with aggressive errors unless absolutely breaking
      }
    };

    recognition.onend = () => {
      if (!intentionalStopRef.current) {
        try {
          // Keep recording automatically if not intentionally stopped
          recognition.start();
        } catch (e) {
             // Ignore
        }
      } else {
        setIsListening(false);
        setInterimText('');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    intentionalStopRef.current = true;
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
    // BUG-08: Clear any pending silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ── Auto-read question when it changes ───────────────────────────────────
  useEffect(() => {
    if (phase === 'answering' && ttsEnabled && currentQuestion) {
      speakText(`Question ${currentIdx + 1}. ${currentQuestion.text}`);
    }
  }, [currentIdx, phase]);

  // ── TTS ──────────────────────────────────────────────────────────────────
  const speakText = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    stopListening(); // Don't record the AI's own voice

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate  = 0.9;

    // Pick the best available voice — read at call-time so voices are populated
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      return voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
          || voices.find(v => v.lang === 'en-IN')
          || voices.find(v => v.lang.startsWith('en'))
          || voices[0]
          || null;
    };

    const bestVoice = pickVoice();
    if (bestVoice) utterance.voice = bestVoice;

    // Chrome bug fix: synthesis pauses mid-sentence on long text.
    // Resume every 5 s only if Chrome already paused it on its own.
    const keepAlive = setInterval(() => {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    }, 5000);

    utterance.onstart = () => setIsListening(false);
    utterance.onend   = () => {
      clearInterval(keepAlive);
      setIsSpeaking(false);
      startListening(); // automatically start recording once question is read
    };
    utterance.onerror = () => {
      clearInterval(keepAlive);
      setIsSpeaking(false);
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  const toggleTts = () => {
    if (isSpeaking) stopSpeaking();
    setTtsEnabled(prev => !prev);
  };

  const toggleListening = () => {
    if (isListening) stopListening(); else startListening();
  };

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
    stopSpeaking();
    stopListening();
    saveCurrentAnswer();
    if (currentIdx + 1 >= questions.length) {
      setPhase('review');
    } else {
      setCurrentIdx(prev => prev + 1);
      setCurrentAnswer('');
      setInterimText('');
      setTimer(0);
    }
  };

  // BUG-08: Stable ref for handleNextQuestion so the silence timer callback
  // always calls the latest version without stale closure issues.
  const handleNextQuestionRef = useRef(handleNextQuestion);
  useEffect(() => { handleNextQuestionRef.current = handleNextQuestion; });

  const handleSkipQuestion = () => {
    setCurrentAnswer('[No answer provided]');
    handleNextQuestion();
  };

  const handleGoToQuestion = (idx: number) => {
    stopListening();
    const saved = collectedAnswers[idx];
    setCurrentIdx(idx);
    setCurrentAnswer(
      saved && saved.answerText !== '[No answer provided]' ? saved.answerText : ''
    );
    setInterimText('');
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
    stopListening();
    if (confirm('Are you sure you want to exit? Your progress will be saved and can be resumed.')) {
      navigate('/ai-interview');
    }
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

  // Review screen
  if (phase === 'review') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="pt-16">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <div className="text-center mb-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-gray-800">Review Your Answers</h2>
              <p className="text-gray-500 mt-1">Edit any answer before submitting</p>
            </div>

            <div className="space-y-4 mb-8">
              {questions.map((q, idx) => {
                const ans     = collectedAnswers[idx];
                const answered = ans && ans.answerText !== '[No answer provided]';
                return (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-primary font-semibold mb-1">Q{idx + 1} · {q.type}</p>
                        <p className="text-sm font-bold text-gray-800 mb-2">{q.text}</p>
                        <p className={`text-sm ${answered ? 'text-gray-600' : 'text-gray-400 italic'}`}>
                          {ans?.answerText || 'Not answered'}
                        </p>
                      </div>
                      <button onClick={() => handleGoToQuestion(idx)}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border border-primary text-primary text-xs font-bold rounded-lg hover:bg-primary-light transition">
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
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
              {/* Mic controls */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-bold text-gray-700">Your Response</span>

                {speechSupported ? (
                  <button
                    onClick={toggleListening}
                    title={isListening ? 'Stop recording' : 'Start voice input'}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                      isListening
                        ? 'bg-red-500 text-white animate-pulse shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {isListening
                      ? <><MicOff className="w-4 h-4" /> Stop</>
                      : <><Mic className="w-4 h-4" /> Speak</>}
                  </button>
                ) : (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                    Voice not supported — please type
                  </span>
                )}

                {isListening && (
                  <span className="text-xs text-red-500 font-medium animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />
                    Listening…
                  </span>
                )}
              </div>

              {/* Textarea + interim overlay */}
              <div className="relative">
                <textarea
                  value={currentAnswer}
                  onChange={e => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer here, or click 'Speak' to use your microphone…"
                  rows={6}
                  className="w-full p-4 border border-gray-300 rounded-xl resize-none focus:border-primary focus:ring-1 focus:ring-primary text-gray-800 placeholder-gray-400"
                />
                {/* Interim (partial) speech shown below textarea */}
                {interimText && (
                  <p className="mt-1 px-2 text-sm text-gray-400 italic">
                    {interimText}…
                  </p>
                )}
              </div>

              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

              {/* Action row */}
              <div className="flex justify-between items-center mt-4">
                <span className="text-xs text-gray-400">
                  {currentAnswer.length} characters
                </span>
                <div className="flex gap-3">
                  <button onClick={handleSkipQuestion}
                    className="flex items-center gap-1.5 px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition">
                    <SkipForward className="w-4 h-4" /> Skip
                  </button>
                  <button onClick={handleNextQuestion}
                    className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl shadow-button flex items-center gap-2 transition-all">
                    {currentIdx + 1 >= questions.length
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
              💡 <strong>Tip:</strong> Click <strong>Speak</strong> and talk — your words appear in the box in real time.
              {!speechSupported && ' (Use Chrome or Edge for voice input.)'}
            </p>
          </div>

        </div>
      </main>
    </div>
  );
};

export default InterviewSessionPage;

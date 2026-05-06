/**
 * LiveInterviewSession — Exponent-style conversational AI interview
 * Light theme matching existing app design system.
 * Uses GCS Cloud STT/TTS via backend APIs.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, X, Clock, FileText, Mic } from 'lucide-react';
import AuthService from '../services/authService';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/api$/, '');

// ── Types ──────────────────────────────────────────────────────────
interface Question { id: string; question_text: string; question_number: number; category: string; }
interface ChatMsg { role: 'interviewer' | 'you'; text: string; qNum?: number; }
type Phase = 'init' | 'loading' | 'speaking' | 'countdown' | 'recording' | 'processing' | 'done' | 'submitting' | 'error';

const SILENCE_MS = 3000;
const MAX_DURATION_SECS = 300;  // 5 minutes max
const MIN_SUBMIT_SECS = 60;    // Submit enabled after 1 min

function authHeaders(): Record<string, string> { return { 'Content-Type': 'application/json', ...AuthService.getAuthHeaders() }; }
function pad2(n: number) { return n.toString().padStart(2, '0'); }
function fmtTime(s: number) { return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; }
function catColor(c: string) {
  const l = (c || '').toLowerCase();
  if (l === 'technical' || l === 'problem_solving') return '#E63E29';
  if (l === 'behavioral' || l === 'situational') return '#9333ea';
  if (l === 'follow_up') return '#16a34a';
  return '#3b82f6';
}
function catLabel(c: string) {
  const m: Record<string, string> = { hr: 'HR', technical: 'Technical', behavioral: 'Behavioral', follow_up: 'Follow-up', situational: 'Situational', problem_solving: 'Problem Solving', general: 'General', introduction: 'Introduction' };
  return m[(c || '').toLowerCase()] || c || 'General';
}

// ═══════════════════════════════════════════════════════════════════
export const LiveInterviewSession = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = (location.state || {}) as { resumeId?: string; interviewType?: string; numQuestions?: number; };

  // State
  const [phase, setPhase] = useState<Phase>('init');
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalQ, setTotalQ] = useState(8);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(2);
  const [errorMsg, setErrorMsg] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Refs
  const phaseRef = useRef<Phase>('init');
  const currentQRef = useRef<Question | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const timerIv = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEl = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceCtxRef = useRef<AudioContext | null>(null);
  const silenceStreamRef = useRef<MediaStream | null>(null);
  const silenceRafRef = useRef<number>(0);
  const silenceActiveRef = useRef(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { currentQRef.current = currentQ; }, [currentQ]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Timer — runs continuously once interview starts
  useEffect(() => {
    const active: Phase[] = ['speaking', 'countdown', 'recording', 'processing', 'done'];
    if (active.includes(phase)) {
      if (!timerIv.current) timerIv.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerIv.current) { clearInterval(timerIv.current); timerIv.current = null; }
    }
  }, [phase]);
  useEffect(() => () => { if (timerIv.current) clearInterval(timerIv.current); }, []);

  // Auto-end at 5 minutes
  useEffect(() => {
    if (elapsed >= MAX_DURATION_SECS && !['done', 'submitting', 'error', 'init', 'loading'].includes(phaseRef.current)) {
      stopSpeaking();
      silenceActiveRef.current = false;
      if (mediaRecRef.current?.state === 'recording') mediaRecRef.current.stop();
      setPhase('done');
    }
  }, [elapsed]);

  // Auto-scroll transcript
  useEffect(() => { if (transcriptEl.current) transcriptEl.current.scrollTop = transcriptEl.current.scrollHeight; }, [chatLog]);

  // ── TTS via Cloud API ──────────────────────────────────────────────
  const speak = useCallback(async (text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        const res = await fetch(`${API_BASE}/api/interview/tts/`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('TTS failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) { audioRef.current.pause(); }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        await audio.play();
      } catch { resolve(); }
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
  }, []);

  // ── Safe cleanup helper ──────────────────────────────────────────
  const cleanupAudio = useCallback(() => {
    silenceActiveRef.current = false;
    cancelAnimationFrame(silenceRafRef.current);
    try { silenceCtxRef.current?.close(); } catch { /* already closed */ }
    silenceCtxRef.current = null;
    try { silenceStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* already stopped */ }
    silenceStreamRef.current = null;
    try {
      if (mediaRecRef.current?.state === 'recording') mediaRecRef.current.stop();
      mediaRecRef.current?.stream?.getTracks().forEach(t => t.stop());
    } catch { /* already stopped */ }
    mediaRecRef.current = null;
  }, []);

  // ── STT via MediaRecorder + Cloud API ────────────────────────────
  const startRecording = useCallback(async () => {
    // Always cleanup previous resources first
    cleanupAudio();
    await new Promise(r => setTimeout(r, 100)); // brief delay for mic release

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecRef.current = rec;
      rec.start();

      // ── Auto-Calibrating Voice Activity Detector (VAD) ──
      // Phase 1: Measure mic baseline noise for ~1 second
      // Phase 2: Set threshold dynamically above baseline, then detect silence
      silenceActiveRef.current = true;
      const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
      silenceCtxRef.current = actx;
      silenceStreamRef.current = stream;

      const analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.minDecibels = -90;
      analyser.smoothingTimeConstant = 0.3;
      actx.createMediaStreamSource(stream).connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const sampleRate = actx.sampleRate;
      const binWidth = sampleRate / analyser.fftSize;

      // Voice frequency band: 300Hz – 3000Hz
      const minBin = Math.max(1, Math.floor(300 / binWidth));
      const maxBin = Math.min(buf.length - 1, Math.floor(3000 / binWidth));
      const binCount = maxBin - minBin + 1;

      // Calibration state
      const calibrationStart = Date.now();
      const CALIBRATION_MS = 1200; // measure baseline for 1.2 seconds
      let baselineSamples: number[] = [];
      let dynamicThreshold = 15; // fallback if calibration fails
      let isCalibrated = false;

      // Detection state
      let lastSpeechTime = Date.now();
      let hasSpokenEnough = false;
      let speechFrameCount = 0;
      const recordingStart = Date.now();
      const MAX_RECORDING_MS = 55000; // hard cap at 55s (STT limit is 60s)

      const getVoiceBandEnergy = (): number => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = minBin; i <= maxBin; i++) sum += buf[i];
        return sum / binCount;
      };

      const check = () => {
        if (!silenceActiveRef.current) return;

        // Hard safety cap — always stop before 60s STT limit
        if (Date.now() - recordingStart > MAX_RECORDING_MS) {
          finalizeAnswer();
          return;
        }

        const energy = getVoiceBandEnergy();

        // ── Phase 1: Calibration ──
        if (!isCalibrated) {
          baselineSamples.push(energy);
          if (Date.now() - calibrationStart >= CALIBRATION_MS) {
            // Calculate baseline: mean + 2x standard deviation of noise
            const mean = baselineSamples.reduce((a, b) => a + b, 0) / baselineSamples.length;
            const variance = baselineSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / baselineSamples.length;
            const stdDev = Math.sqrt(variance);
            // Threshold = baseline mean + 2 std deviations, minimum 8
            dynamicThreshold = Math.max(8, mean + stdDev * 2);
            isCalibrated = true;
            console.log(`[VAD] Calibrated: baseline=${mean.toFixed(1)}, stdDev=${stdDev.toFixed(1)}, threshold=${dynamicThreshold.toFixed(1)}`);
          }
          silenceRafRef.current = requestAnimationFrame(check);
          return;
        }

        // ── Phase 2: Voice Activity Detection ──
        if (energy > dynamicThreshold) {
          lastSpeechTime = Date.now();
          speechFrameCount++;
          // Need ~250ms of sustained voice to arm (prevents coughs/clicks)
          if (speechFrameCount > 15) {
            hasSpokenEnough = true;
          }
        } else {
          // Decay speech counter when quiet (prevents random spikes accumulating)
          speechFrameCount = Math.max(0, speechFrameCount - 2);
        }

        // Trigger silence detection only after confirmed speech
        if (hasSpokenEnough && Date.now() - lastSpeechTime > SILENCE_MS) {
          finalizeAnswer();
          return;
        }

        silenceRafRef.current = requestAnimationFrame(check);
      };
      check();
    } catch { setErrorMsg('Microphone access denied.'); setPhase('error'); }
  }, [cleanupAudio]);

  const stopRecording = useCallback((): Promise<string> => {
    silenceActiveRef.current = false;
    cancelAnimationFrame(silenceRafRef.current);
    try { silenceCtxRef.current?.close(); } catch { /* already closed */ }
    silenceCtxRef.current = null;
    try { silenceStreamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* already stopped */ }
    silenceStreamRef.current = null;

    return new Promise(async (resolve) => {
      const rec = mediaRecRef.current;
      if (!rec || rec.state === 'inactive') { resolve(''); return; }
      rec.onstop = async () => {
        rec.stream.getTracks().forEach(t => t.stop());
        if (!audioChunksRef.current.length) { resolve(''); return; }
        setIsTranscribing(true);
        try {
          const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
          const blob = new Blob(audioChunksRef.current, { type: mime });
          const fd = new FormData();
          fd.append('audio', blob, 'rec.webm');
          const res = await fetch(`${API_BASE}/api/interview/transcribe/`, {
            method: 'POST', headers: AuthService.getAuthHeaders(), body: fd,
          });
          const data = await res.json();
          const txt = data.text || '';
          setTranscriptText(txt);
          resolve(txt);
        } catch { resolve(''); }
        finally { setIsTranscribing(false); }
      };
      rec.stop();
    });
  }, []);

  // ── Intent Detection ─────────────────────────────────────────────
  const detectIntent = (text: string): 'repeat' | 'change_topic' | 'answer' => {
    const lower = text.toLowerCase();
    const repeatPhrases = ['repeat', 'say again', 'didn\'t listen', 'did not listen', 'not hear', 'once more', 'come again', 'pardon', 'say that again', 'repeat the question', 'can you repeat'];
    const changePhrases = ['change topic', 'change the topic', 'different topic', 'skip this', 'not comfortable', 'next topic', 'another question', 'different question', 'skip question', 'i don\'t know', 'no idea', 'pass'];
    if (repeatPhrases.some(p => lower.includes(p))) return 'repeat';
    if (changePhrases.some(p => lower.includes(p))) return 'change_topic';
    return 'answer';
  };

  // ── Core Flow ────────────────────────────────────────────────────
  const requestMic = async () => {
    setPhase('loading');
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setErrorMsg('Microphone access denied.'); setPhase('error'); return; }
    startInterview();
  };

  const startInterview = async () => {
    setPhase('loading');
    try {
      const res = await fetch(`${API_BASE}/api/interview/live/start/`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          interview_type: locState.interviewType || 'Mixed',
          resume_id: locState.resumeId || null,
          total_questions: locState.numQuestions || 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSessionId(data.session_id);
      setTotalQ(data.total_questions || 8);
      askQuestion(data.current_question);
    } catch (e: any) { setErrorMsg(e.message); setPhase('error'); }
  };

  const askQuestion = useCallback(async (q: Question) => {
    setCurrentQ(q);
    setTranscriptText('');
    setChatLog(prev => [...prev, { role: 'interviewer', text: q.question_text, qNum: q.question_number }]);
    setPhase('speaking');
    stopSpeaking();
    await speak(q.question_text);
    // Countdown before recording
    setPhase('countdown');
    setCountdown(2);
    await new Promise<void>(res => { let c = 2; const iv = setInterval(() => { c--; setCountdown(c); if (c <= 0) { clearInterval(iv); res(); } }, 1000); });
    setPhase('recording');
    startRecording();
  }, [speak, stopSpeaking, startRecording]);

  const finalizeAnswer = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    setPhase('processing');
    const answerText = await stopRecording() || '[No answer provided]';
    const q = currentQRef.current!;

    // Detect user intent
    const intent = detectIntent(answerText);

    if (intent === 'repeat') {
      // User wants to hear the question again
      setChatLog(prev => [...prev, { role: 'you', text: answerText }]);
      await new Promise(r => setTimeout(r, 400));
      askQuestion(q); // Re-ask same question
      return;
    }

    if (intent === 'change_topic') {
      // User wants a different question — send skip signal to backend
      setChatLog(prev => [...prev, { role: 'you', text: answerText }]);
      try {
        const res = await fetch(`${API_BASE}/api/interview/live/chat/`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            answer_text: '[Candidate requested topic change]',
            question_number: q.question_number,
            current_question_id: q.id,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        if (!data.next_question) { setPhase('done'); return; }
        await new Promise(r => setTimeout(r, 400));
        askQuestion(data.next_question);
      } catch (e: any) { setErrorMsg(e.message); setPhase('error'); }
      return;
    }

    // Normal answer
    setChatLog(prev => [...prev, { role: 'you', text: answerText }]);
    setAnsweredCount(prev => prev + 1);

    try {
      const res = await fetch(`${API_BASE}/api/interview/live/chat/`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          answer_text: answerText,
          question_number: q.question_number,
          current_question_id: q.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (!data.next_question) { setPhase('done'); return; }
      await new Promise(r => setTimeout(r, 600));
      askQuestion(data.next_question);
    } catch (e: any) { setErrorMsg(e.message); setPhase('error'); }
  }, [stopRecording, askQuestion]);

  const handleNext = useCallback(() => {
    if (phaseRef.current === 'recording') finalizeAnswer();
    else if (phaseRef.current === 'speaking' || phaseRef.current === 'countdown') {
      stopSpeaking();
      setPhase('recording');
      startRecording();
    }
  }, [finalizeAnswer, stopSpeaking, startRecording]);

  const handleSubmit = async () => {
    setPhase('submitting');
    try {
      const res = await fetch(`${API_BASE}/api/interview/live/submit-all/`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ session_id: sessionIdRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      navigate('/ai-interview-feedback', { state: { evaluation: data, sessionId: sessionIdRef.current } });
    } catch (e: any) { setErrorMsg(e.message || 'Evaluation failed.'); setPhase('error'); }
  };

  // ── Render ───────────────────────────────────────────────────────
  const progress = totalQ > 0 ? (answeredCount / totalQ) * 100 : 0;
  const orbColor = phase === 'recording' ? '#E63E29' : phase === 'speaking' ? '#3b82f6' : phase === 'countdown' ? '#f97316' : phase === 'processing' ? '#16a34a' : '#94a3b8';

  return (
    <div className="min-h-screen bg-gray-50 flex" style={{ fontFamily: "'Inter', 'Poppins', sans-serif" }}>
      {/* Transcript Panel */}
      {showTranscript && (
        <div className="fixed left-0 top-0 bottom-0 w-[380px] bg-white border-r border-gray-200 z-30 flex flex-col shadow-lg">
          <div className="flex justify-between items-start p-5 border-b border-gray-200">
            <div>
              <div className="text-sm font-bold text-gray-800">Interview Transcript</div>
              <div className="text-xs text-gray-400 mt-1">Real-time transcript of your conversation</div>
            </div>
            <button onClick={() => setShowTranscript(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1">✕</button>
          </div>
          <div ref={transcriptEl} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatLog.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'you' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'interviewer' ? (
                  <div className="max-w-[260px]">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 ml-1">Interviewer</div>
                    <div className="bg-gray-100 text-gray-700 rounded-tr-2xl rounded-br-2xl rounded-bl-2xl px-3.5 py-2.5 text-[13px] leading-relaxed">{msg.text}</div>
                  </div>
                ) : (
                  <div className="max-w-[260px]">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 mr-1 text-right">You</div>
                    <div className="bg-primary text-white rounded-tl-2xl rounded-bl-2xl rounded-br-2xl px-3.5 py-2.5 text-[13px] leading-relaxed">{msg.text}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${showTranscript ? 'ml-[380px]' : ''}`}>
        {/* Progress bar */}
        {!['init', 'loading'].includes(phase) && (
          <div className="h-[3px] bg-gray-200">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* ── INIT ── */}
        {phase === 'init' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-lg px-6">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
                <Mic className="w-9 h-9 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3">Ready for Live Interview?</h2>
              <p className="text-gray-500 mb-6 leading-relaxed">
                Your AI interviewer will ask questions one-by-one based on your resume.<br />
                Answer naturally — just like a real conversation.
              </p>
              <div className="flex justify-center gap-3 mb-6">
                <span className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">{locState.numQuestions || 8} Questions</span>
                <span className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">{locState.interviewType || 'Mixed'}</span>
                <span className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-semibold rounded-full">🎙 Voice</span>
              </div>
              <button onClick={requestMic}
                className="px-8 py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl shadow-button transition-all text-base">
                Start Live Interview
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {phase === 'loading' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Preparing your personalized interview…</p>
            </div>
          </div>
        )}

        {/* ── ACTIVE PHASES ── */}
        {['speaking', 'countdown', 'recording', 'processing', 'done'].includes(phase) && currentQ && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5">
            {/* Question meta */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 font-medium">Question {currentQ.question_number} of {totalQ}</span>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border"
                style={{ color: catColor(currentQ.category), borderColor: catColor(currentQ.category) + '44', background: catColor(currentQ.category) + '11' }}>
                {catLabel(currentQ.category)}
              </span>
            </div>

            {/* Question text */}
            <div className="text-center max-w-2xl">
              <p className="text-sm text-gray-400 mb-2">The interviewer asks…</p>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800 leading-snug">{currentQ.question_text}</h2>
            </div>

            {/* Orb */}
            <div className="relative w-[120px] h-[120px] flex items-center justify-center my-4">
              {phase === 'recording' && (
                <>
                  <div className="absolute w-[120px] h-[120px] rounded-full border-2 animate-ping" style={{ borderColor: orbColor + '44' }} />
                  <div className="absolute w-[150px] h-[150px] rounded-full border animate-ping" style={{ borderColor: orbColor + '22', animationDelay: '0.5s' }} />
                </>
              )}
              <div className="w-[72px] h-[72px] rounded-full transition-all duration-500"
                style={{
                  background: orbColor,
                  boxShadow: `0 0 30px ${orbColor}44, 0 0 60px ${orbColor}22`,
                  animation: phase === 'speaking' ? 'pulse 1.5s ease-in-out infinite' : undefined,
                }} />
              <div className="absolute text-2xl pointer-events-none">
                {phase === 'speaking' && '🔊'}
                {phase === 'countdown' && <span className="text-3xl font-black text-gray-700">{countdown}</span>}
                {phase === 'recording' && '🎙'}
                {phase === 'processing' && '⚙️'}
              </div>
            </div>

            {/* Status text */}
            {phase === 'speaking' && <p className="text-sm text-blue-500 font-medium animate-pulse">AI is speaking…</p>}
            {phase === 'countdown' && <p className="text-sm text-orange-500 font-medium">Get ready to answer…</p>}
            {phase === 'recording' && (
              <div className="w-full max-w-lg">
                <div className="bg-white border border-gray-200 rounded-xl p-4 text-center min-h-[56px] shadow-card">
                  {isTranscribing ? (
                    <span className="text-sm text-blue-500 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Transcribing…</span>
                  ) : transcriptText ? (
                    <span className="text-sm text-gray-700">{transcriptText}</span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Listening… speak now</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 text-center mt-2">Auto-submits after {SILENCE_MS / 1000}s of silence</p>
              </div>
            )}
            {phase === 'processing' && (
              <p className="text-sm text-green-600 font-medium flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing your answer…</p>
            )}
            {phase === 'done' && (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 border-4 border-green-400 flex items-center justify-center text-2xl">✓</div>
                <p className="text-lg font-bold text-gray-800 mb-1">All questions answered!</p>
                <p className="text-sm text-gray-500">Review your transcript and submit for AI evaluation.</p>
              </div>
            )}
          </div>
        )}

        {/* ── SUBMITTING ── */}
        {phase === 'submitting' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-bold text-gray-800 mb-1">Evaluating your interview…</h2>
              <p className="text-sm text-gray-400">This takes 15–30 seconds</p>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md text-center shadow-card">
              <span className="text-5xl mb-4 block">⚠️</span>
              <h2 className="text-xl font-bold text-gray-800 mb-3">Something went wrong</h2>
              <p className="text-gray-500 mb-6">{errorMsg}</p>
              <button onClick={() => { setPhase('init'); setErrorMsg(''); }}
                className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl transition">
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* ── Bottom Bar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white">
          {/* Timer — shows remaining time */}
          {(() => {
            const remaining = Math.max(0, MAX_DURATION_SECS - elapsed);
            const isLow = remaining <= 30;
            return (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-mono font-semibold ${
                isLow ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600'
              }`}>
                <Clock className="w-3.5 h-3.5" /> {fmtTime(remaining)}
              </div>
            );
          })()}

          {/* Center buttons */}
          <div className="flex items-center gap-3">
            {['speaking', 'countdown', 'recording'].includes(phase) && (
              <button onClick={() => { stopSpeaking(); if (mediaRecRef.current?.state === 'recording') { mediaRecRef.current.stop(); silenceActiveRef.current = false; } if (currentQRef.current) askQuestion(currentQRef.current); }}
                className="px-4 py-2.5 text-gray-600 hover:text-gray-800 text-sm font-semibold transition hover:bg-gray-100 rounded-xl">
                Try a different question
              </button>
            )}
            {phase === 'recording' && (
              <button onClick={handleNext}
                className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-xl shadow-button transition">
                Submit answer →
              </button>
            )}
            {/* Submit interview — visible during active phases after 1 min, and always on done */}
            {(phase === 'done' || (['speaking', 'countdown', 'recording', 'processing'].includes(phase) && elapsed >= MIN_SUBMIT_SECS)) && (
              <button onClick={handleSubmit}
                className="px-6 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-bold rounded-xl shadow-button transition">
                Submit interview
              </button>
            )}
          </div>

          {/* Transcript toggle */}
          <button onClick={() => setShowTranscript(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition ${showTranscript ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
            <FileText className="w-4 h-4" /> Transcript {chatLog.length > 0 && `(${chatLog.length})`}
          </button>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.08); opacity: 0.85; } }
      `}</style>
    </div>
  );
};

export default LiveInterviewSession;

// src/hooks/useSTT.ts
import { useState, useRef, useCallback, useEffect } from 'react';

export function useSTT() {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [sttError, setSttError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognition | null>(null);
  const isRecRef = useRef(false);
  const txRef = useRef(''); // accumulates final segments

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setIsSupported(false);
  }, []);

  const startRecording = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSttError('not_supported'); return; }

    // clean up any previous instance
    if (recRef.current) {
      try { recRef.current.stop(); } catch (_) {}
    }

    const rec = new SR();
    rec.lang = 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          txRef.current += e.results[i][0].transcript + ' ';
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      setTranscript(txRef.current + interim);
    };

    // BUG-05 FIX: Chrome auto-stops after ~60s — restart if still recording
    rec.onend = () => {
      if (isRecRef.current) {
        try { rec.start(); } catch (_) {}
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      const ignore = ['no-speech', 'aborted'];
      if (!ignore.includes(e.error)) {
        setSttError(e.error);
      }
    };

    recRef.current = rec;
    isRecRef.current = true;
    txRef.current = '';
    setTranscript('');
    setSttError(null);

    try {
      rec.start();
    } catch (e) {
      setSttError('start_failed');
    }
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback((): string => {
    isRecRef.current = false;
    try { recRef.current?.stop(); } catch (_) {}
    setIsRecording(false);
    return txRef.current.trim();
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    txRef.current = '';
  }, []);

  useEffect(() => {
    return () => {
      isRecRef.current = false;
      try { recRef.current?.stop(); } catch (_) {}
    };
  }, []);

  return {
    transcript,
    isRecording,
    isSupported,
    sttError,
    startRecording,
    stopRecording,
    resetTranscript,
  };
}

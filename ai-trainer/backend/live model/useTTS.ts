// src/hooks/useTTS.ts
import { useRef, useCallback, useEffect } from 'react';

export function useTTS() {
  const synth = useRef(window.speechSynthesis);
  const voicesLoaded = useRef(false);

  const getVoice = () => {
    const voices = synth.current.getVoices();
    return (
      voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
      voices.find(v => v.lang === 'en-IN') ||
      voices.find(v => v.lang.startsWith('en-US')) ||
      voices.find(v => v.lang.startsWith('en')) ||
      null
    );
  };

  // BUG-07 FIX: pre-load voices on mount
  useEffect(() => {
    const load = () => { voicesLoaded.current = true; };
    if (synth.current.getVoices().length > 0) {
      voicesLoaded.current = true;
    } else {
      synth.current.addEventListener('voiceschanged', load);
    }
    return () => {
      synth.current.removeEventListener('voiceschanged', load);
      synth.current.cancel();
    };
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      synth.current.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.88;
      utter.pitch = 1.0;
      utter.volume = 1.0;

      const v = getVoice();
      if (v) utter.voice = v;

      // BUG-06 FIX: Chrome silently pauses long utterances — keep-alive ping every 5s
      const ping = setInterval(() => {
        if (synth.current.paused) synth.current.resume();
      }, 5000);

      utter.onend = () => { clearInterval(ping); resolve(); };
      utter.onerror = () => { clearInterval(ping); resolve(); };
      synth.current.speak(utter);
    });
  }, []);

  const stopSpeaking = useCallback(() => {
    synth.current.cancel();
  }, []);

  const isSpeaking = useCallback(() => synth.current.speaking, []);

  return { speak, stopSpeaking, isSpeaking };
}

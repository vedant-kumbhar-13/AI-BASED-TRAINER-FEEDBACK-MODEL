// src/hooks/useSilenceDetector.ts
import { useRef, useCallback } from 'react';

export function useSilenceDetector(onSilence: () => void, silenceMs = 3000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const resetSilenceTimer = useCallback(() => {
    if (!activeRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (activeRef.current) onSilence();
    }, silenceMs);
  }, [onSilence, silenceMs]);

  const startSilenceDetection = useCallback(() => {
    activeRef.current = true;
    resetSilenceTimer();
  }, [resetSilenceTimer]);

  const stopSilenceDetection = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { startSilenceDetection, stopSilenceDetection, resetSilenceTimer };
}

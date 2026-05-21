// src/hooks/useInterviewSession.ts
const K_SESSION = 'iv_session';
const K_IDX = 'iv_current_index';
const K_ANS = (id: string) => `iv_ans_${id}`;

export interface StoredAnswer {
  questionId: string;
  questionText: string;
  questionType: string;
  answerText: string;
  timestamp: string;
}

export function useInterviewSession() {
  const saveSession = (sessionId: string, questions: any[]) => {
    try {
      localStorage.setItem(K_SESSION, JSON.stringify({ sessionId, questions }));
      localStorage.setItem(K_IDX, '0');
    } catch (_) {}
  };

  const loadSession = (): { sessionId: string; questions: any[] } | null => {
    try {
      const raw = localStorage.getItem(K_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const saveCurrentIndex = (i: number) => {
    try { localStorage.setItem(K_IDX, String(i)); } catch (_) {}
  };

  const loadCurrentIndex = (): number =>
    parseInt(localStorage.getItem(K_IDX) || '0', 10);

  const saveAnswer = (qId: string, qText: string, qType: string, answer: string) => {
    try {
      localStorage.setItem(K_ANS(qId), JSON.stringify({
        questionId: qId,
        questionText: qText,
        questionType: qType,
        answerText: answer,
        timestamp: new Date().toISOString(),
      }));
    } catch (_) {}
  };

  const loadAnswer = (qId: string): StoredAnswer | null => {
    try {
      const raw = localStorage.getItem(K_ANS(qId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const loadAllAnswers = (questions: any[]): StoredAnswer[] =>
    questions.map(q => {
      const stored = loadAnswer(q.id);
      return stored || {
        questionId: q.id,
        questionText: q.question_text || q.text,
        questionType: q.category || q.type || 'general',
        answerText: '[No answer provided]',
        timestamp: new Date().toISOString(),
      };
    });

  const clearSession = (questions: any[]) => {
    try {
      localStorage.removeItem(K_SESSION);
      localStorage.removeItem(K_IDX);
      questions.forEach(q => localStorage.removeItem(K_ANS(q.id)));
    } catch (_) {}
  };

  return {
    saveSession,
    loadSession,
    saveCurrentIndex,
    loadCurrentIndex,
    saveAnswer,
    loadAnswer,
    loadAllAnswers,
    clearSession,
  };
}

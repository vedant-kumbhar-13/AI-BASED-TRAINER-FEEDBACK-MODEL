// Shows all 8 recorded answers before final AI submission; lets user re-record any answer

import { useState, useMemo } from 'react';
import { useInterviewSession } from '../../hooks/useInterviewSession';

const TYPE_BADGE = {
  HR:         { bg: 'rgba(59,130,246,0.2)',  color: '#60a5fa',  border: 'rgba(59,130,246,0.35)' },
  Behavioral: { bg: 'rgba(139,92,246,0.2)',  color: '#a78bfa',  border: 'rgba(139,92,246,0.35)' },
  Technical:  { bg: 'rgba(249,115,22,0.2)',  color: '#fb923c',  border: 'rgba(249,115,22,0.35)' },
};

/**
 * AnswerReview — review screen shown after all 8 questions are answered.
 * Props:
 *   questions  {Array}    — the 8 question objects from start_interview
 *   sessionId  {string}   — current session UUID (unused here, passed for context)
 *   onSubmit   {fn}       — called when user clicks Submit for AI Evaluation
 *   onReRecord {fn(index)}— called with question index when Re-record is clicked
 */
export default function AnswerReview({ questions = [], sessionId, onSubmit, onReRecord }) {
  const { loadAllAnswers } = useInterviewSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load all answers from localStorage once on render
  const answers = useMemo(() => loadAllAnswers(questions), [questions, loadAllAnswers]);

  // Count valid answers (not the default placeholder)
  const validCount = answers.filter(
    a => a.answerText && a.answerText !== '[No answer provided]'
  ).length;

  const canSubmit = validCount >= 3;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit();
    } finally {
      // Parent will unmount this component on success;
      // reset in case of error so user can retry
      setIsSubmitting(false);
    }
  };

  // ── Styles ──────────────────────────────────────────────────────────────
  const s = {
    wrapper: {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      padding: '32px 24px',
    },
    inner: { maxWidth: '640px', width: '100%' },
    header: { textAlign: 'center', marginBottom: '32px' },
    iconCircle: {
      width: '72px', height: '72px', borderRadius: '50%',
      background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '30px', margin: '0 auto 16px',
    },
    title: { fontSize: '24px', fontWeight: '800', color: '#f1f5f9', marginBottom: '6px' },
    sub:   { fontSize: '14px', color: '#64748b' },
    qCard: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px', padding: '20px 24px',
      marginBottom: '12px',
    },
    qCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' },
    qNum: { fontSize: '12px', fontWeight: '600', color: '#475569', letterSpacing: '0.5px' },
    typeBadge: (type) => {
      const b = TYPE_BADGE[type] || TYPE_BADGE.Technical;
      return {
        padding: '3px 10px', borderRadius: '999px', fontSize: '11px',
        fontWeight: '600', background: b.bg, color: b.color, border: `1px solid ${b.border}`,
      };
    },
    qText: { fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '12px' },
    answerBox: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '10px', padding: '12px 16px',
      fontSize: '13px', color: '#94a3b8', lineHeight: '1.7',
    },
    warningBadge: {
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 12px', borderRadius: '999px',
      background: 'rgba(245,158,11,0.15)',
      border: '1px solid rgba(245,158,11,0.35)',
      color: '#fbbf24', fontSize: '12px', fontWeight: '600',
    },
    reRecordBtn: {
      background: 'none', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '7px', padding: '6px 14px',
      color: '#64748b', fontSize: '12px', fontWeight: '500',
      cursor: 'pointer', transition: 'all 0.15s', marginTop: '12px',
    },
    footer: { marginTop: '24px', textAlign: 'center' },
    minAnswersMsg: {
      background: 'rgba(245,158,11,0.1)',
      border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: '10px', padding: '12px 16px',
      color: '#fbbf24', fontSize: '13px', lineHeight: '1.6',
      marginBottom: '16px', textAlign: 'left',
    },
    hintText: { fontSize: '12px', color: '#475569', marginBottom: '12px' },
    submitBtn: {
      width: '100%', padding: '18px',
      background: canSubmit && !isSubmitting
        ? 'linear-gradient(135deg,#22c55e,#16a34a)'
        : 'rgba(255,255,255,0.06)',
      border: 'none', borderRadius: '14px',
      color: canSubmit && !isSubmitting ? '#fff' : '#475569',
      fontWeight: '700', fontSize: '16px',
      cursor: canSubmit && !isSubmitting ? 'pointer' : 'not-allowed',
      transition: 'all 0.2s',
      boxShadow: canSubmit && !isSubmitting ? '0 6px 24px rgba(34,197,94,0.35)' : 'none',
    },
  };

  return (
    <div style={s.wrapper}>
      <div style={s.inner}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.iconCircle}>✅</div>
          <h1 style={s.title}>Interview Complete!</h1>
          <p style={s.sub}>Review your answers before submitting for AI evaluation.</p>
        </div>

        {/* Answer cards */}
        {questions.map((q, i) => {
          const ans = answers[i] || {};
          const hasAnswer = ans.answerText && ans.answerText !== '[No answer provided]';
          const type = q.type || 'Technical';

          return (
            <div key={q.id || i} style={s.qCard}>
              <div style={s.qCardTop}>
                <span style={s.qNum}>QUESTION {i + 1}</span>
                <span style={s.typeBadge(type)}>{type}</span>
              </div>

              <p style={s.qText}>{q.text || q.question_text || '—'}</p>

              {hasAnswer ? (
                <div style={s.answerBox}>{ans.answerText}</div>
              ) : (
                <span style={s.warningBadge}>⚠ No answer recorded</span>
              )}

              <button
                style={s.reRecordBtn}
                onClick={() => onReRecord(i)}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#f1f5f9';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }}
              >
                🔄 Re-record Answer
              </button>
            </div>
          );
        })}

        {/* Footer */}
        <div style={s.footer}>
          {!canSubmit && (
            <div style={s.minAnswersMsg}>
              ⚠ You need at least <strong>3 recorded answers</strong> to submit for evaluation.
              Currently recorded: <strong>{validCount} of {questions.length}</strong>.
              Use "Re-record Answer" above to record missing answers.
            </div>
          )}

          <p style={s.hintText}>
            {canSubmit
              ? `${validCount} of ${questions.length} answers recorded · Evaluation typically takes 20–30 seconds`
              : 'Submit will unlock once you have 3+ answers.'}
          </p>

          <button
            style={s.submitBtn}
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? '⏳ Submitting…' : '🚀 Submit for AI Evaluation →'}
          </button>
        </div>

      </div>
    </div>
  );
}

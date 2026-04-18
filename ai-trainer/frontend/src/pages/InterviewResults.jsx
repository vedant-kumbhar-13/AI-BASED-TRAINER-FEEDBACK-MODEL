// Full interview results page — scores, AI feedback, accordion breakdown, PDF download

import { useState } from 'react';
import ScoreGauge from '../components/results/ScoreGauge';
import ReportTemplate from '../components/results/ReportTemplate';
import { generateInterviewPDF } from '../utils/pdfGenerator';

// ── Placement readiness badge config ────────────────────────────────────────
const READINESS_BADGE = {
  not_ready:    { label: 'Not Ready',    bg: 'rgba(239,68,68,0.2)',   color: '#f87171', border: 'rgba(239,68,68,0.35)'   },
  needs_work:   { label: 'Needs Work',   bg: 'rgba(245,158,11,0.2)',  color: '#fbbf24', border: 'rgba(245,158,11,0.35)'  },
  almost_ready: { label: 'Almost Ready', bg: 'rgba(59,130,246,0.2)',  color: '#60a5fa', border: 'rgba(59,130,246,0.35)'  },
  ready:        { label: 'Ready',        bg: 'rgba(34,197,94,0.2)',   color: '#4ade80', border: 'rgba(34,197,94,0.35)'   },
  highly_ready: { label: 'Highly Ready', bg: 'rgba(168,85,247,0.2)',  color: '#c084fc', border: 'rgba(168,85,247,0.35)'  },
};

// ── Accordion item for each question ────────────────────────────────────────
function QuestionAccordion({ qr, index }) {
  const [open, setOpen] = useState(false);

  const s = {
    card: {
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px', marginBottom: '10px', overflow: 'hidden',
    },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px', cursor: 'pointer', userSelect: 'none',
    },
    hLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
    qNum: {
      minWidth: '28px', height: '28px', borderRadius: '50%',
      background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', fontWeight: '700', color: '#818cf8',
    },
    qText: { fontSize: '14px', color: '#cbd5e1', fontWeight: '500' },
    scorePill: {
      padding: '3px 12px', borderRadius: '999px', fontSize: '13px', fontWeight: '700',
      background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
      border: '1px solid rgba(99,102,241,0.3)',
    },
    body: { padding: '0 20px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' },
    label: { fontSize: '11px', fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: '16px', marginBottom: '6px' },
    text: { fontSize: '14px', color: '#94a3b8', lineHeight: '1.7' },
    strengthBox: { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '10px 14px', marginTop: '10px', fontSize: '13px', color: '#86efac', lineHeight: '1.6' },
    weakBox:     { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '10px 14px', marginTop: '8px',  fontSize: '13px', color: '#fcd34d', lineHeight: '1.6' },
    scoresRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' },
    scoreChip: { padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', color: '#94a3b8' },
    chevron: { fontSize: '12px', color: '#475569', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' },
  };

  const score = parseFloat(qr.score || 0).toFixed(1);

  return (
    <div style={s.card}>
      <div style={s.header} onClick={() => setOpen(o => !o)}>
        <div style={s.hLeft}>
          <span style={s.qNum}>{qr.question_index || index + 1}</span>
          <span style={s.qText}>{qr.questionText || `Question ${qr.question_index || index + 1}`}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={s.scorePill}>{score}/10</span>
          <span style={s.chevron}>▼</span>
        </div>
      </div>

      {open && (
        <div style={s.body}>
          {qr.answerText && (
            <>
              <p style={s.label}>Your Answer</p>
              <p style={s.text}>{qr.answerText}</p>
            </>
          )}
          {qr.feedback && (
            <>
              <p style={s.label}>AI Feedback</p>
              <p style={s.text}>{qr.feedback}</p>
            </>
          )}
          <div style={s.scoresRow}>
            {qr.content_score     != null && <span style={s.scoreChip}>Content: {parseFloat(qr.content_score).toFixed(1)}</span>}
            {qr.communication_score != null && <span style={s.scoreChip}>Communication: {parseFloat(qr.communication_score).toFixed(1)}</span>}
            {qr.relevance_score   != null && <span style={s.scoreChip}>Relevance: {parseFloat(qr.relevance_score).toFixed(1)}</span>}
          </div>
          {qr.strength   && <div style={s.strengthBox}>💪 {qr.strength}</div>}
          {qr.improvement && <div style={s.weakBox}>💡 {qr.improvement}</div>}
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
/**
 * InterviewResults — full results dashboard.
 * Props: { results } — full evaluation JSON from /submit-all/ API
 */
export default function InterviewResults({ results = {} }) {
  const scores   = results.scores   || {};
  const qResults = results.question_results || [];
  const readiness = READINESS_BADGE[results.placement_readiness] || READINESS_BADGE.needs_work;

  const recommendations = (() => {
    try {
      const r = results.recommendations;
      return Array.isArray(r) ? r : JSON.parse(r || '[]');
    } catch { return []; }
  })();

  const handlePDF = () => generateInterviewPDF();

  // ── Styles ──────────────────────────────────────────────────────────────
  const s = {
    page: {
      minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e293b)',
      fontFamily: "'Inter','Segoe UI',sans-serif", padding: '32px 24px',
    },
    inner: { maxWidth: '760px', margin: '0 auto' },
    topBar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '36px',
    },
    pageTitle: { fontSize: '26px', fontWeight: '800', color: '#f1f5f9', letterSpacing: '-0.5px' },
    pdfBtn: {
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '10px 22px', borderRadius: '10px',
      background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
      color: '#a5b4fc', fontWeight: '600', fontSize: '13px', cursor: 'pointer',
      transition: 'all 0.15s',
    },
    mainGaugeRow: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
      marginBottom: '36px',
    },
    readinessBadge: {
      padding: '6px 18px', borderRadius: '999px',
      background: readiness.bg, color: readiness.color,
      border: `1px solid ${readiness.border}`,
      fontSize: '13px', fontWeight: '700',
    },
    sectionTitle: { fontSize: '13px', fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px' },
    smallGaugeRow: { display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '36px' },
    card: (bg, border) => ({
      background: bg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px 24px',
    }),
    summaryCard: {
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px', padding: '24px', marginBottom: '24px',
    },
    summaryText: { fontSize: '15px', color: '#cbd5e1', lineHeight: '1.8' },
    twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' },
    colTitle: { fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' },
    colText: { fontSize: '14px', lineHeight: '1.7' },
    recItem: {
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      marginBottom: '12px',
    },
    recNum: {
      minWidth: '26px', height: '26px', borderRadius: '50%',
      background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', fontWeight: '700', color: '#818cf8', flexShrink: 0,
    },
    recText: { fontSize: '14px', color: '#94a3b8', lineHeight: '1.7', paddingTop: '2px' },
    section: { marginBottom: '32px' },
    divider: { border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)', margin: '28px 0' },
  };

  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* ── Top bar ── */}
        <div style={s.topBar}>
          <h1 style={s.pageTitle}>Your Interview Results</h1>
          <button style={s.pdfBtn} onClick={handlePDF}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.28)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
          >
            📄 Download PDF Report
          </button>
        </div>

        {/* ── 1. Overall gauge + readiness badge ── */}
        <div style={s.mainGaugeRow}>
          <ScoreGauge score={results.overall_score} label="Overall Score" size="large" />
          <span style={s.readinessBadge}>
            {readiness.label}
          </span>
        </div>

        <hr style={s.divider} />

        {/* ── 2. Category score row ── */}
        <div style={s.section}>
          <p style={s.sectionTitle}>Score Breakdown</p>
          <div style={s.smallGaugeRow}>
            <ScoreGauge score={scores.hr}            label="HR"            size="small" />
            <ScoreGauge score={scores.technical}     label="Technical"     size="small" />
            <ScoreGauge score={scores.communication} label="Communication" size="small" />
            <ScoreGauge score={scores.confidence}    label="Confidence"    size="small" />
            <ScoreGauge score={scores.structure}     label="Structure"     size="small" />
          </div>
        </div>

        <hr style={s.divider} />

        {/* ── 3. AI Summary ── */}
        <div style={s.section}>
          <p style={s.sectionTitle}>AI Assessment</p>
          <div style={s.summaryCard}>
            <p style={s.summaryText}>{results.summary || '—'}</p>
          </div>
        </div>

        {/* ── 4. Strength + Weakness ── */}
        <div style={s.twoCol}>
          <div style={s.card('rgba(34,197,94,0.07)', 'rgba(34,197,94,0.2)')}>
            <p style={{ ...s.colTitle, color: '#4ade80' }}>💪 Top Strength</p>
            <p style={{ ...s.colText, color: '#86efac' }}>{results.top_strength || '—'}</p>
          </div>
          <div style={s.card('rgba(245,158,11,0.07)', 'rgba(245,158,11,0.2)')}>
            <p style={{ ...s.colTitle, color: '#fbbf24' }}>⚡ Top Weakness</p>
            <p style={{ ...s.colText, color: '#fcd34d' }}>{results.top_weakness || '—'}</p>
          </div>
        </div>

        {/* ── 5. Recommendations ── */}
        {recommendations.length > 0 && (
          <div style={s.section}>
            <p style={s.sectionTitle}>Recommendations</p>
            {recommendations.map((rec, i) => (
              <div key={i} style={s.recItem}>
                <div style={s.recNum}>{i + 1}</div>
                <p style={s.recText}>{rec}</p>
              </div>
            ))}
          </div>
        )}

        <hr style={s.divider} />

        {/* ── 6. Question accordion ── */}
        <div style={s.section}>
          <p style={s.sectionTitle}>Question Breakdown</p>
          {qResults.length > 0
            ? qResults.map((qr, i) => <QuestionAccordion key={i} qr={qr} index={i} />)
            : <p style={{ color: '#475569', fontSize: '14px' }}>No per-question data available.</p>
          }
        </div>

        {/* ── 7. Hidden report template for PDF ── */}
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <ReportTemplate results={results} />
        </div>

      </div>
    </div>
  );
}

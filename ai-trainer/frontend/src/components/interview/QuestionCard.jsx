// Displays the current interview question with live transcript and recording status

/**
 * QuestionCard — the main interview screen, changes appearance per phase.
 *
 * Props:
 *   phase          {string}  — 'speaking' | 'countdown' | 'recording' | 'saving_answer'
 *   question       {object}  — { text, type }
 *   questionNumber {number}
 *   totalQuestions {number}
 *   transcript     {string}  — live STT transcript (shown during recording)
 *   countdown      {number}  — shown during 'countdown' phase (2, 1, …)
 *   onSkip         {fn}      — called by 'Next Question →' button
 */
export default function QuestionCard({
  phase = 'speaking',
  question = {},
  questionNumber = 1,
  totalQuestions = 8,
  transcript = '',
  countdown = 2,
  onSkip,
}) {
  const progress    = Math.round((questionNumber / totalQuestions) * 100);
  const questionType = question.type || 'Technical';

  // Type badge colour map
  const badgeColor = {
    HR:         { bg: 'rgba(59,130,246,0.2)',  text: '#60a5fa',  border: 'rgba(59,130,246,0.4)'  },
    Behavioral: { bg: 'rgba(139,92,246,0.2)',  text: '#a78bfa',  border: 'rgba(139,92,246,0.4)'  },
    Technical:  { bg: 'rgba(249,115,22,0.2)',  text: '#fb923c',  border: 'rgba(249,115,22,0.4)'  },
  };
  const badge = badgeColor[questionType] || badgeColor.Technical;

  // ── Inline styles ────────────────────────────────────────────────────────
  const s = {
    wrapper: {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
      fontFamily: "'Inter','Segoe UI',sans-serif", padding: '24px',
    },
    card: {
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '24px', padding: '36px 40px',
      maxWidth: '620px', width: '100%',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
    },
    topBar: {
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: '12px',
    },
    counter: { fontSize: '13px', fontWeight: '600', color: '#64748b' },
    badgePill: {
      padding: '4px 12px', borderRadius: '999px', fontSize: '12px',
      fontWeight: '600', background: badge.bg, color: badge.text,
      border: `1px solid ${badge.border}`,
    },
    progressTrack: {
      height: '4px', background: 'rgba(255,255,255,0.08)',
      borderRadius: '999px', marginBottom: '32px', overflow: 'hidden',
    },
    progressFill: {
      height: '100%', borderRadius: '999px', width: `${progress}%`,
      background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
      transition: 'width 0.4s ease',
    },
    avatarArea: {
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      marginBottom: '28px', minHeight: '120px', justifyContent: 'center',
    },
    questionText: {
      fontSize: '20px', fontWeight: '600', color: '#f1f5f9',
      lineHeight: '1.6', textAlign: 'center', marginBottom: '24px',
    },
    transcriptBox: {
      background: 'rgba(96,165,250,0.08)',
      border: '1px solid rgba(96,165,250,0.2)',
      borderRadius: '12px', padding: '16px 20px',
      minHeight: '72px', marginBottom: '20px',
    },
    transcriptText: {
      fontSize: '15px', lineHeight: '1.7',
      color: transcript ? '#e2e8f0' : '#475569',
      fontStyle: transcript ? 'normal' : 'italic',
    },
    skipBtn: {
      background: 'none', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '8px', padding: '10px 20px',
      color: '#94a3b8', fontSize: '13px', fontWeight: '500',
      cursor: 'pointer', transition: 'all 0.15s',
      display: 'block', margin: '0 auto',
    },
    countdownNum: {
      fontSize: '72px', fontWeight: '900', color: '#f1f5f9',
      lineHeight: 1, animation: 'countPulse 0.6s ease-out',
    },
    recordingDot: {
      width: '16px', height: '16px', borderRadius: '50%',
      background: '#ef4444', display: 'inline-block',
      marginRight: '10px', animation: 'blink 1s infinite',
    },
    recordingLabel: {
      fontSize: '15px', fontWeight: '600', color: '#f87171',
      display: 'flex', alignItems: 'center',
    },
    savedLabel: {
      fontSize: '16px', fontWeight: '600', color: '#4ade80',
      display: 'flex', alignItems: 'center', gap: '8px',
    },
  };

  // ── Phase-specific avatar content ────────────────────────────────────────
  const renderAvatar = () => {
    if (phase === 'speaking') {
      return (
        <>
          <style>{`
            @keyframes pulseRing {
              0%   { transform: scale(1);   opacity: 0.6; }
              100% { transform: scale(1.8); opacity: 0; }
            }
            @keyframes blink {
              0%,100% { opacity: 1; }
              50%      { opacity: 0.2; }
            }
            @keyframes countPulse {
              0%   { transform: scale(1.3); opacity: 0.4; }
              100% { transform: scale(1);   opacity: 1; }
            }
          `}</style>
          <div style={{ position: 'relative', width: '96px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Pulsing rings */}
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid rgba(99,102,241,0.5)',
                animation: `pulseRing 2s ease-out ${i * 0.5}s infinite`,
              }} />
            ))}
            {/* AI avatar circle */}
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '34px', boxShadow: '0 0 30px rgba(99,102,241,0.5)',
              zIndex: 1,
            }}>
              🤖
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '12px' }}>
            AI is reading the question…
          </p>
        </>
      );
    }

    if (phase === 'countdown') {
      return (
        <>
          <style>{`
            @keyframes countPulse {
              0%   { transform: scale(1.3); opacity: 0.4; }
              100% { transform: scale(1);   opacity: 1; }
            }
          `}</style>
          <div style={{ position: 'relative', width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Countdown circle ring */}
            <svg width="100" height="100" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="4"/>
              <circle
                cx="50" cy="50" r="44" fill="none"
                stroke="#6366f1" strokeWidth="4"
                strokeDasharray={2 * Math.PI * 44}
                strokeDashoffset={2 * Math.PI * 44 * (1 - countdown / 2)}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.9s linear' }}
              />
            </svg>
            <span style={s.countdownNum}>{countdown}</span>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '12px' }}>
            Get ready to speak…
          </p>
        </>
      );
    }

    if (phase === 'recording') {
      return (
        <div style={s.recordingLabel}>
          <span style={s.recordingDot} />
          Recording…
        </div>
      );
    }

    if (phase === 'saving_answer') {
      return (
        <div style={s.savedLabel}>
          <span style={{ fontSize: '24px' }}>✅</span>
          Answer Saved
        </div>
      );
    }

    return null;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.wrapper}>
      <div style={s.card}>

        {/* Top bar */}
        <div style={s.topBar}>
          <span style={s.counter}>Question {questionNumber} of {totalQuestions}</span>
          <span style={s.badgePill}>{questionType}</span>
        </div>

        {/* Progress bar */}
        <div style={s.progressTrack}>
          <div style={s.progressFill} />
        </div>

        {/* Phase avatar */}
        <div style={s.avatarArea}>
          {renderAvatar()}
        </div>

        {/* Question text */}
        <p style={s.questionText}>{question.text || question.question_text || '…'}</p>

        {/* Live transcript — only during recording */}
        {phase === 'recording' && (
          <div style={s.transcriptBox}>
            <p style={s.transcriptText}>
              {transcript || 'Start speaking…'}
            </p>
          </div>
        )}

        {/* Skip button — only during recording */}
        {phase === 'recording' && (
          <button
            style={s.skipBtn}
            onClick={onSkip}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#f1f5f9';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            Next Question →
          </button>
        )}

      </div>
    </div>
  );
}

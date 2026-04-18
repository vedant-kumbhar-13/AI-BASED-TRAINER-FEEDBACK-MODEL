// Checks browser compatibility for Web Speech API and MediaDevices

import { useState, useEffect } from 'react';

/**
 * BrowserCheck — detects Web Speech API support.
 * Props: { onContinue, onFallback }
 */
export default function BrowserCheck({ onContinue, onFallback }) {
  const [supported, setSupported] = useState(null); // null = checking

  useEffect(() => {
    const ok = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    setSupported(ok);
  }, []);

  // ── Styles ──────────────────────────────────────────────────────────────
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
      borderRadius: '20px',
      padding: '48px 40px',
      maxWidth: '480px', width: '100%',
      textAlign: 'center',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
    },
    iconCircle: (color) => ({
      width: '80px', height: '80px', borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center',
      justifyContent: 'center', margin: '0 auto 24px',
      fontSize: '36px',
    }),
    title: {
      fontSize: '22px', fontWeight: '700', color: '#f1f5f9',
      marginBottom: '12px', letterSpacing: '-0.3px',
    },
    sub: {
      fontSize: '14px', color: '#94a3b8', lineHeight: '1.6',
      marginBottom: '32px',
    },
    btnPrimary: {
      display: 'inline-block', padding: '14px 32px',
      background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
      color: '#fff', fontWeight: '600', fontSize: '15px',
      border: 'none', borderRadius: '12px', cursor: 'pointer',
      transition: 'transform 0.15s,box-shadow 0.15s',
      boxShadow: '0 4px 15px rgba(59,130,246,0.4)',
    },
    btnFallback: {
      background: 'none', border: 'none', color: '#94a3b8',
      fontSize: '13px', cursor: 'pointer', textDecoration: 'underline',
      marginTop: '16px', display: 'block',
      transition: 'color 0.15s',
    },
    checking: {
      fontSize: '14px', color: '#94a3b8', animation: 'pulse 1.5s infinite',
    },
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (supported === null) {
    return (
      <div style={s.wrapper}>
        <div style={s.card}>
          <p style={s.checking}>Checking browser compatibility…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrapper}>
      <div style={s.card}>

        {supported ? (
          <>
            {/* ── Supported ── */}
            <div style={s.iconCircle('rgba(34,197,94,0.15)')}>
              <span style={{ color: '#22c55e' }}>✓</span>
            </div>

            <h2 style={s.title}>Voice Interview Ready</h2>
            <p style={s.sub}>
              Voice interview is supported in your browser. Microphone access will be
              requested next.
            </p>

            <button
              style={s.btnPrimary}
              onClick={onContinue}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(59,130,246,0.5)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(59,130,246,0.4)';
              }}
            >
              Continue to Interview →
            </button>
          </>
        ) : (
          <>
            {/* ── Not supported ── */}
            <div style={s.iconCircle('rgba(245,158,11,0.15)')}>
              <span style={{ color: '#f59e0b', fontSize: '32px' }}>⚠</span>
            </div>

            <h2 style={{ ...s.title, color: '#fbbf24' }}>Voice Not Available</h2>
            <p style={s.sub}>
              Your browser doesn't support the Web Speech API.
              <br />
              Please open this page in <strong style={{ color: '#f1f5f9' }}>Google Chrome</strong> for voice features.
            </p>

            <button
              style={s.btnFallback}
              onClick={onFallback}
              onMouseEnter={e => e.currentTarget.style.color = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
            >
              Continue with text input instead
            </button>
          </>
        )}

      </div>
    </div>
  );
}

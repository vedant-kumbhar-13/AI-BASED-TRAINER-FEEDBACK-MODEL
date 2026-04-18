// Circular score display — colour-coded by score range

/**
 * ScoreGauge — circular badge showing a numeric score.
 * Props:
 *   score  {number}          — 0–100
 *   label  {string}          — text below the number
 *   size   {'large'|'small'} — large=main gauge, small=category row
 */
export default function ScoreGauge({ score = 0, label = '', size = 'large' }) {
  const num = parseFloat(score) || 0;

  // ── Colour by score range (0–100 scale) ─────────────────────────────────
  let bgTint, borderColor, textColor;
  if (num < 50) {
    bgTint      = 'rgba(183,28,28,0.18)';
    borderColor = '#ef4444';
    textColor   = '#fca5a5';
  } else if (num < 70) {
    bgTint      = 'rgba(230,81,0,0.18)';
    borderColor = '#f97316';
    textColor   = '#fdba74';
  } else {
    bgTint      = 'rgba(46,125,50,0.18)';
    borderColor = '#22c55e';
    textColor   = '#86efac';
  }

  const isLarge  = size === 'large';
  const diameter = isLarge ? 140 : 80;
  const numSize  = isLarge ? '36px' : '20px';
  const lblSize  = isLarge ? '13px' : '11px';

  const s = {
    wrap: {
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: isLarge ? '10px' : '6px',
    },
    circle: {
      width: `${diameter}px`, height: `${diameter}px`,
      borderRadius: '50%',
      background: bgTint,
      border: `${isLarge ? 4 : 3}px solid ${borderColor}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 ${isLarge ? 24 : 12}px ${borderColor}44`,
      transition: 'box-shadow 0.3s',
    },
    num: {
      fontSize: numSize, fontWeight: '800',
      color: textColor, lineHeight: 1,
      fontFamily: "'Inter','Segoe UI',sans-serif",
    },
    outOf: {
      fontSize: isLarge ? '11px' : '9px',
      color: 'rgba(255,255,255,0.3)', marginTop: '2px',
    },
    label: {
      fontSize: lblSize, color: '#94a3b8',
      fontWeight: '500', textAlign: 'center',
      maxWidth: `${diameter + 16}px`,
      lineHeight: 1.3,
      fontFamily: "'Inter','Segoe UI',sans-serif",
    },
  };

  return (
    <div style={s.wrap}>
      <div style={s.circle}>
        <span style={s.num}>{num.toFixed(1)}</span>
        <span style={s.outOf}>/100</span>
      </div>
      {label && <span style={s.label}>{label}</span>}
    </div>
  );
}

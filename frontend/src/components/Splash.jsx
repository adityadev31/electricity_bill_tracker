import { useEffect, useState } from 'react';

const TITLE = ['Electricity', 'Bill', 'Calculator'];
const GLYPHS = '₹$⚡01#%&';
const FLAT = 'CM4-302';

// Floating currency / voltage characters (pure text, no images).
const DRIFT = Array.from({ length: 22 }, (_, i) => ({
  ch: ['₹', '₹', 'V', 'A', 'W', 'kWh', '⚡'][i % 7],
  left: (i * 47) % 100,
  delay: (i * 0.37) % 4,
  dur: 5 + ((i * 13) % 6),
  size: 14 + ((i * 7) % 22),
}));

function useScramble(target, startAfter = 1500) {
  const [text, setText] = useState(' '.repeat(target.length));
  useEffect(() => {
    let frame = 0;
    let timer;
    const begin = setTimeout(() => {
      timer = setInterval(() => {
        frame++;
        const settled = Math.floor(frame / 3);
        setText(
          target
            .split('')
            .map((c, i) => (i < settled ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
            .join(''),
        );
        if (settled >= target.length) clearInterval(timer);
      }, 45);
    }, startAfter);
    return () => {
      clearTimeout(begin);
      clearInterval(timer);
    };
  }, [target, startAfter]);
  return text;
}

export default function Splash({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  const flat = useScramble(FLAT);

  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), 3900);
    const b = setTimeout(onDone, 4600);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [onDone]);

  const skip = () => {
    setLeaving(true);
    setTimeout(onDone, 500);
  };

  let letterIndex = 0;
  return (
    <div className={`splash ${leaving ? 'splash--leave' : ''}`} onClick={skip} role="presentation">
      <div className="splash__drift" aria-hidden="true">
        {DRIFT.map((d, i) => (
          <span key={i} style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s`, fontSize: d.size }}>
            {d.ch}
          </span>
        ))}
      </div>

      <div className="splash__scan" aria-hidden="true" />

      <h1 className="splash__title" aria-label="Electricity Bill Calculator">
        {TITLE.map((word, w) => (
          <span className="splash__word" key={word} aria-hidden="true">
            {word.split('').map((c) => {
              const i = letterIndex++;
              return (
                <span key={i} className="splash__letter" style={{ '--i': i }}>
                  {c}
                </span>
              );
            })}
          </span>
        ))}
      </h1>

      <div className="splash__flat">
        <span className="splash__flat-label">FLAT</span>
        <span className="splash__flat-no">{flat}</span>
      </div>

      <div className="splash__bar" aria-hidden="true"><i /></div>
      <p className="splash__skip">tap to skip</p>
    </div>
  );
}

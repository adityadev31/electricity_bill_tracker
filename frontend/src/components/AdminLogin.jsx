import { useEffect, useRef, useState } from 'react';
import { api, token } from '../api.js';

export default function AdminLogin({ onClose, onSuccess }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const refs = useRef([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const submit = async (list) => {
    setBusy(true);
    setError('');
    try {
      const { token: t } = await api.login(list.join(''));
      token.set(t);
      onSuccess();
    } catch (e) {
      setError(e.message);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      cur.current = Array(6).fill('');
      setDigits(cur.current);
      setBusy(false);
      setTimeout(() => refs.current[0]?.focus(), 0);
    }
  };

  // Digits live in a ref too, so fast typing never reads stale state.
  const cur = useRef(Array(6).fill(''));
  const put = (list, focusAt) => {
    cur.current = list;
    setDigits(list);
    if (list.every(Boolean)) submit(list);
    else refs.current[Math.min(focusAt, 5)]?.focus();
  };

  const setAt = (i, d) => {
    const next = [...cur.current];
    next[i] = d;
    put(next, d ? i + 1 : i);
  };

  // Desktop keyboards: handled here synchronously (focus moves before the next key arrives).
  // Mobile keyboards that don't report keys fall back to onChange.
  const change = (i, v) => {
    const ds = v.replace(/\D/g, '');
    if (ds.length > 1) {
      // several digits at once (autofill, IME, fast input): spread them across the boxes
      const next = [...cur.current];
      for (let k = 0; k < ds.length && i + k < 6; k++) next[i + k] = ds[k];
      return put(next, i + ds.length);
    }
    if (ds !== cur.current[i]) setAt(i, ds);
  };

  const keyDown = (i, e) => {
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      setAt(i, e.key);
    } else if (e.key === 'Backspace' && !cur.current[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, '');
      refs.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const paste = (e) => {
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!p) return;
    e.preventDefault();
    put(Array.from({ length: 6 }, (_, i) => p[i] || ''), p.length);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet sheet--narrow" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Admin login">
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Admin</p>
        <h2 className="sheet__title">Enter 6-digit PIN</h2>

        <div className={`pin ${shake ? 'pin--shake' : ''}`} onPaste={paste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={d}
              disabled={busy}
              className={d ? 'filled' : ''}
              aria-label={`PIN digit ${i + 1}`}
              onChange={(e) => change(i, e.target.value)}
              onKeyDown={(e) => keyDown(i, e)}
              onFocus={(e) => e.target.select()}
            />
          ))}
        </div>

        {error ? <p className="notice notice--err">{error}</p> : <p className="hint">{busy ? 'Checking…' : 'Only the admin can switch modes or unlock a month.'}</p>}
      </div>
    </div>
  );
}

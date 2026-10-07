import { useState } from 'react';
import { api, token } from '../api.js';
import { monthLabel, inr } from '../format.js';

export default function AdminPanel({ status, onClose, onChanged, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isTest = status.mode === 'test';
  const [rateIn, setRateIn] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pins, setPins] = useState({ cur: '', next: '', again: '' });
  const [pinMsg, setPinMsg] = useState('');

  const digits = (v) => v.replace(/\D/g, '').slice(0, 6);
  const pinValid = pins.cur.length === 6 && pins.next.length === 6 && pins.next === pins.again;

  const savePin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token: t } = await api.changePin(pins.cur, pins.next);
      token.set(t);
      setPins({ cur: '', next: '', again: '' });
      setPinOpen(false);
      setPinMsg('PIN updated. Other admin sessions were signed out.');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const logout = () => {
    token.clear();
    onLogout();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Admin panel">
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Admin panel</p>
        <h2 className="sheet__title">Controls</h2>

        <div className="group">
          <h3>App mode</h3>
          <div className="seg" role="group" aria-label="App mode">
            <button disabled={busy} className={!isTest ? 'on' : ''} onClick={() => isTest && run(() => api.setMode('real'))}>Real</button>
            <button disabled={busy} className={isTest ? 'on on--test' : ''} onClick={() => !isTest && run(() => api.setMode('test'))}>Test</button>
          </div>
          <p className="hint">
            {isTest
              ? 'Test mode shows sample bills for the last 3 months and accepts entries on any day. Real data is untouched.'
              : 'Real mode uses the real bills. Entries are accepted only on the last day of the month.'}
          </p>
          {isTest && (
            <button className="ghost" disabled={busy} onClick={() => run(api.resetTest)}>Reset sample data</button>
          )}
        </div>

        <div className="group">
          <h3>Force unlock</h3>
          {status.unlocked ? (
            <>
              <p className="notice notice--ok">{monthLabel(status.unlocked.month)} is unlocked. Anyone can enter its readings now.</p>
              <button className="ghost" disabled={busy} onClick={() => run(api.relock)}>Lock again</button>
            </>
          ) : status.unlockTarget ? (
            <>
              <p className="hint">{monthLabel(status.unlockTarget)} was never calculated. Unlock it so the readings can still be entered. Only the latest uncalculated month can be unlocked.</p>
              <button className="cta" disabled={busy} onClick={() => run(api.unlock)}>Force unlock {monthLabel(status.unlockTarget)}</button>
            </>
          ) : (
            <p className="hint">Nothing to unlock. Every due month is already calculated.</p>
          )}
        </div>

        <div className="group">
          <h3>Reset last entry</h3>
          {status.lastBill || status.baseline ? (
            <>
              <p className="hint">
                {status.lastBill
                  ? <>Latest entry: <b className="accent">{monthLabel(status.lastBill.month)}</b> · {inr(status.lastBill.amount)}.</>
                  : <>Starting readings saved on <b className="accent">{status.baseline.date}</b>.</>}{' '}
                Use this if wrong units were saved by mistake. Only the latest entry can be reset.
              </p>
              {!confirmReset ? (
                <button className="ghost ghost--danger" disabled={busy} onClick={() => setConfirmReset(true)}>
                  Reset {status.lastBill ? `${monthLabel(status.lastBill.month)} entry` : 'starting readings'}
                </button>
              ) : (
                <div className="confirm">
                  <p>
                    {status.lastBill ? `Delete the ${monthLabel(status.lastBill.month)} bill? ` : 'Delete the starting readings? '}
                    {!status.lastBill || status.lastBill.reopens
                      ? 'It reopens right away so readings can be entered again.'
                      : 'This month will not reopen for entry, because a later month is already due.'}
                  </p>
                  <div className="pinform__row">
                    <button className="ghost" disabled={busy} onClick={() => setConfirmReset(false)}>Cancel</button>
                    <button className="ghost ghost--danger" disabled={busy}
                      onClick={() => run(async () => { await api.resetLast(status.lastBill ? status.lastBill.month : 'baseline'); setConfirmReset(false); })}>
                      Yes, delete it
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="hint">No saved entry to reset.</p>
          )}
          {status.resets?.length > 0 && (
            <ul className="audit">
              {status.resets.map((r) => (
                <li key={r.at}>
                  {r.month === 'baseline' ? 'Starting readings' : `${monthLabel(r.month)} · ${inr(r.amount)}`} reset on {new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {r.scope === 'test' && ' (test)'}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="group">
          <h3>Unit price</h3>
          <p className="hint">
            Now <b className="accent">{inr(status.rateNow)}</b> / unit.
            {status.ratePending && <> From <b className="accent">{monthLabel(status.ratePending.from)}</b> it becomes <b className="accent">{inr(status.ratePending.rate)}</b>.</>}
          </p>
          {isTest ? <p className="hint">Switch to Real mode to change the price. Test mode never edits real settings.</p> : <>
          <form className="ratebox" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.setRate(rateIn); setRateIn(''); }); }}>
            <div className="money"><b>₹</b>
              <input type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" placeholder="New price per unit"
                value={rateIn} onChange={(e) => setRateIn(e.target.value)} />
            </div>
            <button className="cta cta--inline" disabled={busy || !(Number(rateIn) > 0)}>Set price</button>
          </form>
          <p className="hint">Applies from {monthLabel(status.rateFrom)} onwards. Bills already calculated keep their old price.</p>
          {status.ratePending && <button className="ghost" disabled={busy} onClick={() => run(api.cancelRate)}>Cancel the scheduled change</button>}
          </>}
        </div>

        <div className="group">
          <h3>Admin PIN</h3>
          {pinMsg && <p className="notice notice--ok">{pinMsg}</p>}
          {!pinOpen ? (
            <button className="ghost" onClick={() => { setPinOpen(true); setPinMsg(''); setError(''); }}>Change PIN</button>
          ) : (
            <form className="pinform" onSubmit={savePin}>
              {[['cur', 'Current PIN'], ['next', 'New PIN'], ['again', 'Repeat new PIN']].map(([k, label]) => (
                <label key={k} className="field">
                  <span>{label}</span>
                  <input type="password" inputMode="numeric" autoComplete="off" placeholder="••••••" value={pins[k]}
                    onChange={(e) => setPins({ ...pins, [k]: digits(e.target.value) })} />
                </label>
              ))}
              {pins.again && pins.next !== pins.again && <p className="hint">The new PINs don't match yet.</p>}
              <div className="pinform__row">
                <button type="button" className="ghost" onClick={() => { setPinOpen(false); setError(''); }}>Cancel</button>
                <button className="cta cta--inline" disabled={!pinValid || busy}>Save PIN</button>
              </div>
            </form>
          )}
        </div>

        {error && <p className="notice notice--err">{error}</p>}
        <button className="link logout" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}

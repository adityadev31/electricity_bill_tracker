import { useMemo, useState } from 'react';
import { compute } from '../calc.js';
import { api } from '../api.js';
import { inr, units, monthLabel } from '../format.js';

export default function AddEntry({ status, onClose, onSaved }) {
  const { roommates, previous, entryMonth: month } = status;
  const onboarding = status.entryKind === 'baseline'; // very first readings: no bill is calculated yet
  const fields = [{ id: 'main', label: 'Main meter' }, ...roommates.map((r) => ({ id: r.id, label: `${r.name}'s AC` }))];

  const [closing, setClosing] = useState(Object.fromEntries(fields.map((f) => [f.id, ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nums = Object.fromEntries(Object.entries(closing).map(([k, v]) => [k, v === '' ? NaN : Number(v)]));
  const filled = Object.values(nums).every((n) => Number.isFinite(n) && n >= 0);

  const preview = useMemo(() => {
    if (onboarding || !filled) return null;
    try {
      return { ok: compute({ opening: previous, closing: nums, rate: status.rate }) };
    } catch (e) {
      return { err: e.message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const canSubmit = onboarding ? filled : !!preview?.ok;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const saved = onboarding ? await api.addBaseline(closing) : await api.addBill({ closing });
      onSaved(saved, onboarding);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const nameOf = Object.fromEntries(roommates.map((r) => [r.id, r.name]));

  return (
    <div className="overlay" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">{onboarding ? 'Onboarding' : 'New entry'}</p>
        <h2 className="sheet__title">{onboarding ? 'Starting readings' : monthLabel(month)}</h2>

        {status.mode === 'test' && <p className="notice notice--warn">Test mode: this is sample data, not a real bill.</p>}
        {status.unlocked && <p className="notice notice--ok">Admin unlocked this month for late entry.</p>}

        {onboarding ? (
          <p className="hint">
            Read all four meters <b className="accent">right now</b> and type today's numbers. They become the starting point,
            and no bill is made today. On {status.lastDayDate} the readings are entered again and {monthLabel(status.month)}'s bill is calculated from the difference.
            Once saved, these can't be edited.
          </p>
        ) : (
          <p className="hint">Read all meters together and type today's closing numbers. Once saved, a month can't be edited.</p>
        )}

        <div className="group">
          <h3>{onboarding ? 'Today’s readings' : 'Closing readings'}</h3>
          <div className="fields">
            {fields.map((f) => (
              <label key={f.id} className="field">
                <span>{f.label}{previous && !onboarding && <em> · last {units(previous[f.id])}</em>}</span>
                <input type="number" inputMode="decimal" min={previous && !onboarding ? previous[f.id] : 0} step="any"
                  value={closing[f.id]} placeholder="0"
                  onChange={(e) => setClosing({ ...closing, [f.id]: e.target.value })} required />
              </label>
            ))}
          </div>
        </div>

        {preview?.err && <p className="notice notice--err">{preview.err}</p>}
        {preview?.ok && (
          <div className="preview">
            <div className="preview__meta">
              <span>{units(preview.ok.totalUnits)} units</span><span>·</span>
              <span>{units(preview.ok.commonUnits)} common</span><span>·</span>
              <span>{inr(preview.ok.rate)}/unit</span><span>·</span>
              <span>bill {inr(preview.ok.amount)}</span>
            </div>
            <div className="preview__rows">
              {preview.ok.shares.map((s) => (
                <div key={s.id}><span>{nameOf[s.id]}</span><b>{inr(s.pays)}</b></div>
              ))}
            </div>
          </div>
        )}
        {error && <p className="notice notice--err">{error}</p>}

        <button className="cta" disabled={!canSubmit || busy}>
          {busy ? 'Saving…' : onboarding ? 'Save starting readings' : 'Lock in this month'}
        </button>
      </form>
    </div>
  );
}

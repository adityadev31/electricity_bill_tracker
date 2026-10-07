import { inr, units, monthLabel, useCountUp } from '../format.js';

function Stat({ label, value, accent }) {
  return (
    <div className={`stat ${accent ? 'stat--accent' : ''}`}>
      <span className="stat__v">{value}</span>
      <span className="stat__l">{label}</span>
    </div>
  );
}

function Pays({ value }) {
  const v = useCountUp(value);
  return <>{inr(v)}</>;
}

export default function BillDetail({ bill, roommates, onClose }) {
  const nameOf = Object.fromEntries(roommates.map((r) => [r.id, r.name]));
  const r = bill.result;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Bill</p>
        <h2 className="sheet__title">{monthLabel(bill.month)}</h2>

        <div className="stats">
          <Stat label="Bill" value={inr(bill.amount)} accent />
          <Stat label="Total units" value={units(r.totalUnits)} />
          <Stat label="Common units" value={units(r.commonUnits)} />
          <Stat label="Rate / unit" value={inr(r.rate)} />
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>AC units</th>
                <th>AC cost</th>
                <th>Common ÷ 3</th>
                <th>Pays</th>
              </tr>
            </thead>
            <tbody>
              {r.shares.map((s, i) => (
                <tr key={s.id} style={{ '--d': `${i * 90}ms` }}>
                  <td className="who">{nameOf[s.id]}</td>
                  <td>{units(s.acUnits)}</td>
                  <td>{inr(s.acCost)}</td>
                  <td>{inr(s.common)}</td>
                  <td className="pays"><Pays value={s.pays} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{units(r.acTotal)}</td>
                <td>{inr(r.shares.reduce((a, s) => a + s.acCost, 0))}</td>
                <td>{inr(r.shares.reduce((a, s) => a + s.common, 0))}</td>
                <td className="pays">{inr(bill.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="split" aria-hidden="true">
          {r.shares.map((s) => (
            <i key={s.id} style={{ flexGrow: s.pays }} title={`${nameOf[s.id]} ${inr(s.pays)}`} />
          ))}
        </div>

        <details className="readings">
          <summary>Meter readings</summary>
          <table className="table table--mini">
            <thead><tr><th>Meter</th><th>Opening</th><th>Closing</th></tr></thead>
            <tbody>
              <tr><td>Main</td><td>{units(bill.opening.main)}</td><td>{units(bill.closing.main)}</td></tr>
              {roommates.map((m) => (
                <tr key={m.id}><td>{m.name} AC</td><td>{units(bill.opening[m.id])}</td><td>{units(bill.closing[m.id])}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
        <p className="locked">🔒 Locked · saved {new Date(bill.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>
    </div>
  );
}

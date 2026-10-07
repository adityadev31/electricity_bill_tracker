import { nextRecharge } from '../calc.js';
import { inr, monthLabel, useCountUp } from '../format.js';

function Amount({ value }) {
  const v = useCountUp(value);
  return <>{inr(v, 0)}</>;
}

export default function NextRecharge({ bill, roommates, buffer, rate }) {
  const plan = nextRecharge(bill.result, buffer, rate || bill.result.rate);
  const changed = plan.rate !== bill.result.rate;
  const nameOf = Object.fromEntries(roommates.map((r) => [r.id, r.name]));

  return (
    <section className="next">
      <div className="next__head">
        <div>
          <p className="eyebrow">Next recharge</p>
          <h2>Send this to the treasurer</h2>
        </div>
        <div className="next__total">
          <span>Total</span>
          <b><Amount value={plan.total} /></b>
        </div>
      </div>

      <div className="next__cards">
        {plan.shares.map((s, i) => (
          <div key={s.id} className="pay" style={{ '--d': `${i * 90}ms` }}>
            <span className="pay__name">{nameOf[s.id]}</span>
            <b className="pay__amt"><Amount value={s.recharge} /></b>
            <span className="pay__sub">{inr(s.base, 0)} last month</span>
          </div>
        ))}
      </div>

      <p className="next__note">
        Based on {monthLabel(bill.month)} usage at {inr(plan.rate)}/unit{changed && <> (was {inr(bill.result.rate)})</>}
        {buffer > 0 && <> + {buffer}% buffer so the meter never runs dry</>}. Any leftover balance carries into next month.
      </p>
    </section>
  );
}

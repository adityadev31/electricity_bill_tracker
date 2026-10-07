import { MONTHS, FULL_MONTHS, inr } from '../format.js';

export default function Calendar({ year, setYear, bills, currentMonth, startMonth, entryMonth, onPick }) {
  const byMonth = Object.fromEntries(bills.map((b) => [b.month, b]));
  const curYear = Number(currentMonth.slice(0, 4));
  const minYear = Number(startMonth.slice(0, 4));

  return (
    <section className="cal">
      <div className="cal__head">
        <button className="icon-btn" onClick={() => setYear(year - 1)} disabled={year <= minYear} aria-label="Previous year">‹</button>
        <h2 className="cal__year">{year}</h2>
        <button className="icon-btn" onClick={() => setYear(year + 1)} disabled={year >= curYear} aria-label="Next year">›</button>
      </div>

      <div className="cal__grid">
        {MONTHS.map((m, i) => {
          const key = `${year}-${String(i + 1).padStart(2, '0')}`;
          const bill = byMonth[key];
          const isCurrent = key === currentMonth;
          const isFuture = key > currentMonth;
          const state = bill ? 'has' : key < startMonth ? 'before' : key === entryMonth && !isCurrent ? 'unlocked' : isCurrent ? 'now' : isFuture ? 'future' : 'missed';
          return (
            <button
              key={key}
              className={`tile tile--${state}`}
              style={{ '--d': `${i * 45}ms` }}
              disabled={isFuture || state === 'before'}
              onClick={() => onPick(key, bill)}
              aria-label={`${FULL_MONTHS[i]} ${year}`}
            >
              <span className="tile__m">{m}</span>
              {bill && (
                <>
                  <span className="tile__amt">{inr(bill.amount, 0)}</span>
                  <span className="tile__sub">{bill.result.totalUnits} units</span>
                </>
              )}
              {state === 'unlocked' && <span className="tile__sub tile__sub--unlock">unlocked by admin</span>}
              {state === 'now' && <span className="tile__sub tile__sub--now">this month</span>}
              {state === 'missed' && <span className="tile__sub">no entry</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

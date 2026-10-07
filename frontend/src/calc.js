export const ROOMMATES = [
  { id: 'shagun', name: 'Shagun' },
  { id: 'saumya', name: 'Saumya' },
  { id: 'muskan', name: 'Muskan' },
];

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * opening / closing: { main, shagun, saumya, muskan } meter readings
 * rate: fixed price per unit. Bill amount = total units x rate.
 */
export function compute({ opening, closing, rate }) {
  const ids = ROOMMATES.map((r) => r.id);
  const acUnits = {};
  for (const id of ids) {
    acUnits[id] = round2(closing[id] - opening[id]);
    if (acUnits[id] < 0) throw new Error(`${cap(id)}'s AC reading is lower than last month.`);
  }
  const totalUnits = round2(closing.main - opening.main);
  if (totalUnits <= 0) throw new Error('Main meter must be higher than last month.');
  const acTotal = round2(ids.reduce((s, id) => s + acUnits[id], 0));
  const commonUnits = round2(totalUnits - acTotal);
  if (commonUnits < 0) throw new Error('AC units add up to more than the main meter. Re-check readings.');
  if (!(rate > 0)) throw new Error('Rate per unit is not configured.');

  const amount = round2(totalUnits * rate);
  const commonCostEach = (commonUnits * rate) / 3;

  const shares = ids.map((id) => {
    const acCost = round2(acUnits[id] * rate);
    const common = round2(commonCostEach);
    return { id, acUnits: acUnits[id], acCost, common, pays: round2(acCost + common) };
  });

  // Push any paise rounding drift onto the biggest payer so the total matches the bill exactly.
  const drift = round2(amount - shares.reduce((s, x) => s + x.pays, 0));
  if (drift !== 0) {
    const top = shares.reduce((a, b) => (b.pays > a.pays ? b : a));
    top.pays = round2(top.pays + drift);
  }

  return { amount, totalUnits, acTotal, commonUnits, rate, shares };
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * Next month's recharge, based on last month's consumption.
 * Units are re-priced at `rate` (the upcoming month's rate, which may differ from last month's),
 * then each share gets the buffer % and is rounded up to the next Rs 10 for easy transfers.
 */
export function nextRecharge(result, bufferPercent = 0, rate = result.rate) {
  const k = (1 + bufferPercent / 100) * (rate / result.rate);
  const shares = result.shares.map((s) => ({
    id: s.id,
    base: s.pays,
    recharge: Math.ceil((s.pays * k) / 10) * 10,
  }));
  return { shares, total: shares.reduce((a, s) => a + s.recharge, 0), bufferPercent, rate };
}

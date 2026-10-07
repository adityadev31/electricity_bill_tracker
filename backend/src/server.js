import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { createStore } from './store.js';
import { compute, ROOMMATES } from './calc.js';

const PORT = process.env.PORT || 4000;
const TZ = process.env.TIMEZONE || 'Asia/Kolkata';
const FLAT = 'CM4-302';
const START_MONTH = process.env.START_MONTH || '2026-10';
const RATE = Number(process.env.RATE_PER_UNIT) || 8;
const BUFFER_PERCENT = Number(process.env.BUFFER_PERCENT ?? 10);
const ADMIN_PIN = (process.env.ADMIN_PIN || '').trim();
const ADMIN_ENABLED = /^\d{6}$/.test(ADMIN_PIN);
const SESSION_MS = 8 * 60 * 60 * 1000;

if (!ADMIN_ENABLED) console.warn('⚠ ADMIN_PIN is missing or not 6 digits — admin login is disabled.');

const pad = (n) => String(n).padStart(2, '0');

/** "Today" always comes from the SERVER clock, never from the client. */
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const y = get('year'), m = get('month'), d = get('day');
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    date: `${y}-${pad(m)}-${pad(d)}`,
    month: `${y}-${pad(m)}`,
    lastDayDate: `${y}-${pad(m)}-${pad(lastDay)}`,
    isLastDay: d === lastDay,
    daysLeft: lastDay - d,
  };
}

function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Rate for a month = the latest schedule entry whose `from` is <= that month. */
function rateFor(rates, month) {
  let r = rates[0].rate;
  for (const x of rates) if (x.from <= month) r = x.rate;
  return r;
}

const store = await createStore();

// ---------------------------------------------------------------- admin auth
// PIN source: a PIN changed in the app (salted hash in the settings store) wins over ADMIN_PIN in .env.
let pinRecord = null; // { salt, hash }
let secret;
const adminEnabled = () => !!pinRecord || ADMIN_ENABLED;
const deriveSecret = () =>
  crypto.createHash('sha256').update(`cm4302|${process.env.ADMIN_TOKEN_SECRET || ''}|${pinRecord ? pinRecord.hash : ADMIN_PIN}`).digest();

async function loadAuth() {
  if (process.env.RESET_ADMIN_PIN === 'true' && ADMIN_ENABLED) {
    await store.setSettings({ pin: null });
    console.warn('⚠ RESET_ADMIN_PIN=true: PIN reset to ADMIN_PIN from .env. Remove RESET_ADMIN_PIN afterwards.');
  }
  pinRecord = (await store.getSettings()).pin || null;
  secret = deriveSecret();
}
await loadAuth();

const scrypt = (pin, salt) => crypto.scryptSync(pin, salt, 32).toString('hex');
function verifyPin(pin) {
  if (!/^\d{6}$/.test(pin)) return false;
  if (pinRecord) return crypto.timingSafeEqual(Buffer.from(scrypt(pin, pinRecord.salt), 'hex'), Buffer.from(pinRecord.hash, 'hex'));
  return crypto.timingSafeEqual(hash(pin), hash(ADMIN_PIN));
}

const b64 = (b) => Buffer.from(b).toString('base64url');
const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

function issueToken() {
  const payload = b64(JSON.stringify({ exp: Date.now() + SESSION_MS }));
  return `${payload}.${sign(payload)}`;
}
function validToken(token) {
  if (!adminEnabled() || !token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '');
const isAdmin = (req) => validToken(bearer(req));
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Admin login required.' }));

const hash = (s) => crypto.createHash('sha256').update(s).digest();
const fails = new Map(); // ip -> { count, until }

// ------------------------------------------------------------- app context
const DEMO = [
  { main: 400, shagun: 120, saumya: 60, muskan: 20 },
  { main: 830, shagun: 250, saumya: 150, muskan: 55 },
  { main: 1190, shagun: 340, saumya: 195, muskan: 92 },
];

/** Test mode sample data: the 3 months before the current one. */
async function seedTest() {
  const repo = store.repos.test;
  if ((await repo.list()).length) return;
  const t = today();
  let opening = { main: 0, shagun: 0, saumya: 0, muskan: 0 };
  for (let i = 0; i < DEMO.length; i++) {
    const month = addMonths(t.month, i - DEMO.length);
    const closing = DEMO[i];
    const result = compute({ opening, closing, rate: RATE });
    await repo.add({ month, amount: result.amount, opening, closing, result, createdAt: new Date(`${month}-28T12:00:00Z`).toISOString() });
    opening = closing;
  }
}

async function context() {
  const t = today();
  const settings = { mode: 'real', unlock: null, ...(await store.getSettings()) };
  const mode = settings.mode === 'test' ? 'test' : 'real';
  if (mode === 'test') await seedTest();

  const bills = await store.repos[mode].list();
  const start = mode === 'test' ? addMonths(t.month, -DEMO.length) : START_MONTH;
  const anyDay = mode === 'test'; // test mode lets you try entries on any day

  // The only month admin may force-unlock: the latest month BEFORE this one that is
  // still uncalculated and comes after the last saved bill.
  const last = bills.length ? bills[bills.length - 1].month : null;
  const from = last ? addMonths(last, 1) : start;
  const upto = addMonths(t.month, -1);
  const baseline = (settings.baselines || {})[mode] || null;
  const needsBaseline = bills.length === 0 && !baseline; // onboarding: very first readings
  const target = !needsBaseline && from <= upto ? upto : null;

  const u = settings.unlock;
  const unlocked = u && u.scope === mode && u.month === target ? u : null;
  const hasCurrent = bills.some((b) => b.month === t.month);

  let entryMonth = null;
  if (needsBaseline) entryMonth = t.month; // open on any day until the starting readings are saved
  else if (unlocked) entryMonth = target;
  else if (t.month >= start && (t.isLastDay || anyDay) && !hasCurrent) entryMonth = t.month;

  const rates = [{ from: '0000-00', rate: RATE }, ...(Array.isArray(settings.rates) ? settings.rates : [])].sort((a, b) => a.from.localeCompare(b.from));

  return { t, mode, audit: Array.isArray(settings.audit) ? settings.audit : [], rates, lastMonth: last, bills, start, target, unlocked, hasCurrent, entryMonth, baseline, needsBaseline, previous: last ? bills[bills.length - 1].closing : baseline?.readings || null };
}

async function status(req) {
  const c = await context();
  return {
    flat: FLAT,
    rate: rateFor(c.rates, c.entryMonth || c.t.month), // rate the entry form will use
    rateNow: rateFor(c.rates, c.t.month),
    ratePending: c.rates.find((r) => r.from > c.t.month) || null, // { from, rate } takes effect later
    rateFrom: addMonths(c.t.month, 1), // a new price always starts next month
    nextRechargeRate: c.lastMonth ? rateFor(c.rates, addMonths(c.lastMonth, 1)) : null,
    bufferPercent: BUFFER_PERCENT,
    roommates: ROOMMATES,
    ...c.t,
    mode: c.mode,
    startMonth: c.start,
    entryMonth: c.entryMonth,
    canAdd: c.entryMonth !== null,
    entryKind: c.needsBaseline ? 'baseline' : 'bill', // 'baseline' = onboarding readings, no bill yet
    baseline: c.baseline ? { date: c.baseline.date } : null,
    alreadyAdded: c.hasCurrent,
    unlocked: c.unlocked ? { month: c.unlocked.month, at: c.unlocked.at } : null,
    unlockTarget: c.target,
    previous: c.previous,
    lastBill: c.bills.length
      ? (({ month, amount, createdAt }) => ({
          month, amount, createdAt,
          // true when the month can be re-entered right after a reset (current or previous month)
          reopens: month >= addMonths(c.t.month, -1),
        }))(c.bills[c.bills.length - 1])
      : null,
    resets: isAdmin(req) ? c.audit.slice(-3).reverse() : undefined,
    isAdmin: isAdmin(req),
    adminEnabled: adminEnabled(),
    db: store.kind,
  };
}

// --------------------------------------------------------------------- app
const app = express();
app.set('trust proxy', 1); // behind Render's proxy: use the real client IP for the PIN attempt limiter
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json());

app.get('/api/status', async (req, res) => res.json(await status(req)));
app.get('/api/bills', async (_req, res) => res.json((await context()).bills));

app.post('/api/bills', async (req, res) => {
  try {
    const c = await context();
    if (c.needsBaseline) return res.status(409).json({ error: 'Save the starting readings first.' });
    if (!c.entryMonth) {
      return res.status(c.hasCurrent ? 409 : 403).json({
        error: c.hasCurrent ? 'This month is already recorded and locked.' : `Entries open only on the last day of the month (${c.t.lastDayDate}).`,
      });
    }

    const keys = ['main', ...ROOMMATES.map((r) => r.id)];
    const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
    const closing = {};
    for (const k of keys) {
      closing[k] = num(req.body?.closing?.[k]);
      if (!Number.isFinite(closing[k]) || closing[k] < 0) return res.status(400).json({ error: `Invalid reading for ${k}.` });
    }

    // Opening = last month's closing (or the starting readings for the very first bill).
    const opening = c.previous;

    const result = compute({ opening, closing, rate: rateFor(c.rates, c.entryMonth) });
    const saved = await store.repos[c.mode].add({ month: c.entryMonth, amount: result.amount, opening, closing, result, createdAt: new Date().toISOString() });
    if (c.unlocked) await store.setSettings({ unlock: null });
    res.status(201).json(saved);
  } catch (e) {
    if (e.code === 'DUPLICATE') return res.status(409).json({ error: 'This month is already recorded and locked.' });
    if (e.message && !e.message.startsWith('Cannot')) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Onboarding: the very first readings. Saved as the starting point (no bill yet).
app.post('/api/baseline', async (req, res) => {
  const c = await context();
  if (!c.needsBaseline) return res.status(409).json({ error: 'Starting readings are already saved.' });
  const readings = {};
  for (const k of ['main', ...ROOMMATES.map((r) => r.id)]) {
    const v = req.body?.readings?.[k];
    readings[k] = v === '' || v === null || v === undefined ? NaN : Number(v);
    if (!Number.isFinite(readings[k]) || readings[k] < 0) return res.status(400).json({ error: `Invalid reading for ${k}.` });
  }
  const baseline = { readings, date: c.t.date, createdAt: new Date().toISOString() };
  const baselines = { ...((await store.getSettings()).baselines || {}), [c.mode]: baseline };
  await store.setSettings({ baselines });
  res.status(201).json({ date: baseline.date });
});

// ------------------------------------------------------------------- admin
app.post('/api/admin/login', (req, res) => {
  if (!adminEnabled()) return res.status(503).json({ error: 'Admin PIN is not configured on the server.' });
  const ip = req.ip;
  const f = fails.get(ip);
  if (f?.until > Date.now()) {
    return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil((f.until - Date.now()) / 60000)} min.` });
  }
  const pin = String(req.body?.pin ?? '');
  if (verifyPin(pin)) {
    fails.delete(ip);
    return res.json({ token: issueToken() });
  }
  const count = (f?.count || 0) + 1;
  fails.set(ip, count >= 5 ? { count: 0, until: Date.now() + 5 * 60 * 1000 } : { count });
  res.status(401).json({ error: count >= 5 ? 'Too many attempts. Locked for 5 minutes.' : `Wrong PIN. ${5 - count} attempt(s) left.` });
});

app.post('/api/admin/change-pin', requireAdmin, async (req, res) => {
  const key = `${req.ip}:change`;
  const f = fails.get(key);
  if (f?.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

  const currentPin = String(req.body?.currentPin ?? '');
  const newPin = String(req.body?.newPin ?? '');
  if (!verifyPin(currentPin)) {
    const count = (f?.count || 0) + 1;
    fails.set(key, count >= 5 ? { count: 0, until: Date.now() + 5 * 60 * 1000 } : { count });
    return res.status(401).json({ error: 'Current PIN is incorrect.' });
  }
  fails.delete(key);
  if (!/^\d{6}$/.test(newPin)) return res.status(400).json({ error: 'New PIN must be exactly 6 digits.' });
  if (newPin === currentPin) return res.status(400).json({ error: 'New PIN must be different from the current one.' });

  const salt = crypto.randomBytes(16).toString('hex');
  pinRecord = { salt, hash: scrypt(newPin, salt) };
  await store.setSettings({ pin: pinRecord });
  secret = deriveSecret(); // signs out every other admin session
  res.json({ token: issueToken() }); // keep this one logged in
});

// New price applies from NEXT month only; existing bills keep the rate they were calculated with.
app.post('/api/admin/rate', requireAdmin, async (req, res) => {
  const rate = Math.round(Number(req.body?.rate) * 100) / 100;
  if (!(rate > 0 && rate <= 1000)) return res.status(400).json({ error: 'Enter a price per unit between 0.01 and 1000.' });
  const c = await context();
  if (c.mode === 'test') return res.status(400).json({ error: 'Switch to Real mode to change the price.' });
  const from = addMonths(c.t.month, 1);
  const kept = ((await store.getSettings()).rates || []).filter((r) => r.from < from);
  // Same as what's already in force this month? Then there is nothing to schedule.
  if (rate !== rateFor(c.rates.filter((r) => r.from <= c.t.month), c.t.month)) kept.push({ from, rate, at: new Date().toISOString() });
  await store.setSettings({ rates: kept });
  res.json(await status(req));
});

app.delete('/api/admin/rate', requireAdmin, async (req, res) => {
  const c = await context();
  if (c.mode === 'test') return res.status(400).json({ error: 'Switch to Real mode to change the price.' });
  const kept = ((await store.getSettings()).rates || []).filter((r) => r.from <= c.t.month);
  await store.setSettings({ rates: kept });
  res.json(await status(req));
});

app.post('/api/admin/mode', requireAdmin, async (req, res) => {
  const mode = req.body?.mode;
  if (!['real', 'test'].includes(mode)) return res.status(400).json({ error: 'Mode must be "real" or "test".' });
  if (mode === 'test') await seedTest();
  await store.setSettings({ mode });
  res.json(await status(req));
});

app.post('/api/admin/unlock', requireAdmin, async (req, res) => {
  const c = await context();
  if (!c.target) return res.status(400).json({ error: 'No month is eligible for unlock. Only the latest uncalculated month can be unlocked.' });
  await store.setSettings({ unlock: { scope: c.mode, month: c.target, at: new Date().toISOString() } });
  res.json(await status(req));
});

app.delete('/api/admin/unlock', requireAdmin, async (req, res) => {
  await store.setSettings({ unlock: null });
  res.json(await status(req));
});

// Wrong units submitted by mistake: admin can delete the LATEST saved month only.
app.post('/api/admin/reset-last', requireAdmin, async (req, res) => {
  const c = await context();
  const last = c.bills[c.bills.length - 1];
  if (!last) {
    // No bills yet: the only thing that can be reset is the starting readings.
    if (!c.baseline || req.body?.month !== 'baseline') return res.status(400).json({ error: 'There is no saved entry to reset.' });
    const baselines = { ...((await store.getSettings()).baselines || {}), [c.mode]: null };
    const audit = [...c.audit, { at: new Date().toISOString(), scope: c.mode, month: 'baseline', amount: 0, totalUnits: 0, closing: c.baseline.readings }].slice(-50);
    await store.setSettings({ baselines, audit });
    return res.json(await status(req));
  }
  if (req.body?.month !== last.month) {
    return res.status(409).json({ error: `Only the latest entry (${last.month}) can be reset. Refresh and try again.` });
  }

  await store.repos[c.mode].remove(last.month);
  const audit = [...c.audit, {
    at: new Date().toISOString(), scope: c.mode, month: last.month,
    amount: last.amount, totalUnits: last.result.totalUnits, closing: last.closing,
  }].slice(-50);
  await store.setSettings({ audit });

  // If that month is now the one that can be re-entered late, reopen it straight away.
  const after = await context();
  if (after.target === last.month) {
    await store.setSettings({ unlock: { scope: c.mode, month: last.month, at: new Date().toISOString() } });
  }
  res.json(await status(req));
});

app.post('/api/admin/reset-test', requireAdmin, async (req, res) => {
  await store.repos.test.clear();
  await store.setSettings({ unlock: null });
  await seedTest();
  res.json(await status(req));
});

app.listen(PORT, () => console.log(`⚡ CM4-302 API on http://localhost:${PORT}`));

# CM4-302 · Electricity Bill Calculator

Split the prepaid electricity bill between Shagun, Saumya and Muskan: own AC units + equal share of common usage.

## Run
```bash
# terminal 1
cd backend && npm install && npm run dev      # http://localhost:4000
# terminal 2
cd frontend && npm install && npm run dev     # http://localhost:5173
```

## Connect MongoDB Atlas (when ready)
1. Open `backend/.env`
2. Paste your connection string into `MONGODB_URI=...`
3. Restart the backend. Done — the footer will show "Connected to MongoDB".

Until then, data is saved to `backend/data/bills.json`.

## Onboarding (first readings)
Until the very first readings are saved, entry is open on **any day**. That first entry is the **starting point** (no bill is made). From then on the normal rule applies: readings are entered on the last day of the month and that month's bill is calculated from the difference. Admin can reset the starting readings (Reset last entry) if they were typed wrong, as long as no bill exists yet.

## Anti-cheat
- The **server** clock decides "today"; in Real mode entries are accepted only on the last day of the month.
- A saved month is locked (no edit, no overwrite). Opening readings are always last month's closing.

## Admin (top-right button)
Set a 6-digit `ADMIN_PIN` in `backend/.env` as the starting PIN (checked on the server; 5 wrong tries lock login for 5 minutes).
- **Change PIN:** Admin panel → Change PIN (needs the current PIN). The new PIN is saved as a salted hash in the settings store (file or MongoDB) and overrides `.env`. Other admin sessions are signed out.
- **Forgot the PIN:** set `RESET_ADMIN_PIN=true` in `backend/.env`, restart the backend once (PIN goes back to `ADMIN_PIN`), then remove that line.
- **Real / Test mode:** Test shows sample bills for the last 3 months and allows entries on any day. Real and test data are stored separately, so test mode never touches real bills.
- **Force unlock:** if nobody could enter readings on the last day, admin can reopen the latest uncalculated month (the one after the last saved bill). Only that one month can be unlocked, and it re-locks as soon as it is saved.

- **Reset last entry:** if wrong units were saved by mistake, Admin panel → Reset last entry deletes the **latest** saved month only (with a confirmation). If that month can still be entered (the current or previous month), it reopens right away so the correct readings can be re-entered. Every reset is recorded (month, amount, date) so it can't be used to quietly change readings.
- **Unit price:** Admin panel → Unit price (Real mode only). A new price always starts from **next month**; bills already calculated keep their old price (each bill stores the rate it used), and the scheduled change can be cancelled before it starts. `RATE_PER_UNIT` in `.env` is only the starting price.

`START_MONTH` (default `2026-10`) is the first month tracked. `RATE_PER_UNIT` and `BUFFER_PERCENT` set the rate and recharge buffer.

# Production time and deployment

## Timezone rule
The attendance system's business timezone is **Asia/Kolkata (IST)**. Render's physical region must never determine the school date.

Set in production:

```env
APP_TIMEZONE=Asia/Kolkata
TZ=Asia/Kolkata
TIME_MODE=REAL
```

For local testing you may use:

```env
TIME_MODE=MOCK
MOCK_NOW=2026-10-05T09:15:00+05:30
```

Never enable mock time in production.

## Render
- Region: Singapore (recommended for an India-facing app)
- Root directory: `be` if deploying from the repository root
- Build: `npm ci && npm run prisma:generate`
- Pre-deploy: `npx prisma migrate deploy`
- Start: `npm start`
- Health check: `/api/health`

## Neon
- Use a PostgreSQL database.
- Put the Neon pooled connection string in `DATABASE_URL`.
- Keep production separate from development/staging.

## Prisma
Production migrations use `prisma migrate deploy`; do not use `prisma migrate dev` against production.

The included migration is a **fresh PostgreSQL baseline** matching the current Prisma schema. If the Neon database already contains data, perform a deliberate data migration instead of applying this baseline blindly.

## Date-handling rules (v3)
School dates are stored as the UTC instant of **00:00 IST** (e.g. `2026-10-05` -> `2026-10-04T18:30:00Z`).
Always go through `src/utils/date.js`:

- Format a stored date for output: `todayKey(date)` — never `date.toISOString().slice(0, 10)` (gives the previous day).
- Parse a `YYYY-MM-DD` request value: `parseSchoolDateStrict(value, 'field')` — never `new Date(value)` or `new Date(\`${value}T00:00:00\`)`.
- Inclusive range filters: `gte: parseSchoolDateStrict(from)`, `lte: endOfDay(parseSchoolDateStrict(to))`.
- Add/subtract days: `addDays(date, n)` — never `setDate()`/`getDate()`.
- "Now": `businessNow()` so `TIME_MODE=MOCK` works everywhere.

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import prisma from './lib/prisma.js';
import { port, frontendUrl } from './config/env.js';
import { APP_TIMEZONE_NAME, businessNow, todayKey, weekdayOf, formatSchoolDateTime } from './utils/date.js';
import routes from './routes/index.js';
import notFound from './middleware/not-found.js';
import errorHandler from './middleware/error-handler.js';
import { fileURLToPath } from 'url';
import { syncPermissions } from './services/access.service.js';

const app = express();

app.use(cors({ origin: frontendUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: 'connected' });
  } catch (error) { next(error); }
});

app.get('/api/system/time', (req, res) => {
  const current = businessNow();
  res.json({
    utc: current.toISOString(),
    timezone: APP_TIMEZONE_NAME,
    localDate: todayKey(current),
    localTime: formatSchoolDateTime(current),
    weekday: weekdayOf(current),
    timeMode: (process.env.TIME_MODE || 'REAL').toUpperCase(),
  });
});
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await prisma.$connect();
  // Make sure every permission defined in code exists in the database.
  await syncPermissions();
  app.listen(port, '0.0.0.0', () =>
    console.log(`Backend running on port ${port} (timezone: ${APP_TIMEZONE_NAME})`)
  );
}

// Check if this module is the main entry point
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  start().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export default app;
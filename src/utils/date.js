import { ApiError } from './api-error.js';

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330; // Asia/Kolkata has no DST.

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23', weekday: 'long',
});

const getParts = (input = new Date()) => {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(input))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: parts.weekday.toUpperCase(),
  };
};

export const APP_TIMEZONE_NAME = APP_TIMEZONE;

export const now = () => new Date();
export const schoolParts = (date = new Date()) => getParts(date);
export const todayKey = (date = new Date()) => {
  const p = getParts(date);
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
};
export const weekdayOf = (date = new Date()) => getParts(date).weekday;
export const currentMinutes = (date = new Date()) => {
  const p = getParts(date);
  return p.hour * 60 + p.minute;
};

// Convert a school-local calendar date (YYYY-MM-DD) to the UTC instant
// representing 00:00:00.000 in Asia/Kolkata.
export const parseSchoolDate = (value) => {
  if (value instanceof Date) return startOfDay(value);
  const raw = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Error(`Invalid school date: ${value}`);
  const [, y, m, d] = match.map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MINUTES * 60 * 1000);
};

export const startOfDay = (date = new Date()) => parseSchoolDate(todayKey(date));
export const endOfDay = (date = new Date()) => new Date(startOfDay(date).getTime() + 86400000 - 1);
export const dateOnly = (date = new Date()) => startOfDay(date);
export const dateKey = todayKey;

export const isSameSchoolDate = (a, b) => todayKey(a) === todayKey(b);

export const formatSchoolDateTime = (date = new Date()) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIMEZONE,
    dateStyle: 'medium', timeStyle: 'medium',
  }).format(new Date(date));

export const mockNow = () => {
  if ((process.env.TIME_MODE || 'REAL').toUpperCase() !== 'MOCK') return new Date();
  const value = process.env.MOCK_NOW;
  if (!value) throw new Error('TIME_MODE=MOCK requires MOCK_NOW');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid MOCK_NOW');
  return parsed;
};

export const businessNow = mockNow;

/* ------------------------------------------------------------------ */
/* School-date helpers (all calendar arithmetic is done on IST         */
/* midnights; Asia/Kolkata has no DST so +N*24h is always +N days).    */
/* ------------------------------------------------------------------ */

// Add whole school days to an instant. Independent of the server timezone.
export const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000);

// Strict YYYY-MM-DD (or Date) -> IST-midnight instant; throws ApiError(400).
export const parseSchoolDateStrict = (value, field = 'date') => {
  if (value === undefined || value === null || value === '') {
    throw new ApiError(400, `${field} is required in YYYY-MM-DD format`);
  }
  let parsed;
  try {
    parsed = parseSchoolDate(value);
  } catch {
    throw new ApiError(400, `Invalid ${field}`);
  }
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, `Invalid ${field}`);
  // Reject impossible calendar dates such as 2026-02-31.
  if (!(value instanceof Date) && todayKey(parsed) !== String(value).slice(0, 10)) {
    throw new ApiError(400, `Invalid ${field}`);
  }
  return parsed;
};

// Date-only strings (YYYY-MM-DD) are school dates -> IST midnight.
// Full ISO timestamps keep their exact instant.
export const parseDateInput = (value, field = 'date') => {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    return parseSchoolDateStrict(String(value).trim(), field);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid ${field}`);
  return d;
};

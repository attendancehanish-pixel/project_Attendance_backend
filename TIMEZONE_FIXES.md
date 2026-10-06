# Timezone fixes (v3)

New helpers in `src/utils/date.js`: `addDays`, `parseSchoolDateStrict`, `parseDateInput`.

| File | Fix |
|---|---|
| `services/staff-students.service.js` | Output dates via `todayKey`; `from`/`to` filters parsed as IST days (first day no longer dropped, `to` is inclusive end of day) |
| `services/staff-timetable.service.js` | Same as above for changes, substitutions, and "today" date |
| `services/calendar.service.js` | Month view built from IST-midnight instants (no server-TZ dependence, correct `date` labels) |
| `services/attendance.service.js` | `businessNow()` for the "today only" check; review filters use strict IST parsing |
| `services/attendance-session.service.js` | `addDays` instead of `setDate`; list default range uses `businessNow()`; strict list-date parsing |
| `services/attendance.leave.service.js` | `from`/`to` parsed as IST days (400 on invalid input) |
| `controllers/staff.controller.js` | `dateOfJoining` stored as IST midnight when given as `YYYY-MM-DD` |

Behaviour note: invalid `from`/`to` values on the endpoints above now return HTTP 400 instead of silently producing an invalid filter.

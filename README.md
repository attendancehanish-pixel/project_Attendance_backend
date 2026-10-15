# College Attendance Backend

Layered Express + Prisma backend for the college attendance MVP.

## Architecture

`routes -> middleware -> controllers -> services -> Prisma`

RBAC controls what a user can do. ReBAC/business rules control which academic records the user can act on.

## Main modules

- Authentication / JWT / refresh tokens
- Roles and permissions
- Academic years and calendar
- Standards, subjects, students and staff assignments
- Periods and timetable
- Staff leave and substitutions
- Student absence types
- Attendance sessions and student attendance
- Attendance corrections and adjustments
- Immutable attendance audit history
- Notifications
- Scheduled attendance deadline job

## Setup

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Default development admin:

- Email: `admin@example.com`
- Password: `ChangeMe123!`

Change this immediately. You can set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` before seeding.

## Important attendance rules

- Staff identity comes from the authenticated JWT, not the request body.
- Staff can only mark sessions assigned to them.
- Staff can only mark the current date.
- A session becomes non-editable after it is marked.
- ABSENT requires an active absence type.
- Corrections are separate from the original attendance record.
- Attendance adjustments do not rewrite historical attendance.
- Audit logs are append-only by application convention.
- Academic-year start/end dates cannot be changed after attendance starts.

## Production notes

Before production, replace SQLite with PostgreSQL, use strong secrets, add a real job scheduler/queue, add request validation with a schema library such as Zod/Joi, add rate limiting, and add comprehensive integration tests.


## Calendar and timetable rules

- `WeeklyHoliday` stores the actual weekly off weekdays for each academic year.
- `TimetableSetting.excludeWeeklyHolidaysFromTimetable` defaults to `true`.
- `TimetableEntry.attendanceRequired` defaults to `true`; set it to `false` for timetable periods that must never create attendance sessions.
- `TimetableEntry.isCustom` identifies an explicit exception period, such as a Sunday class when Sunday is a configured weekly holiday.
- `AcademicCalendar.dayType` may use `HOLIDAY`/`VACATION` to suppress attendance for a date, or `WORKING_DAY` to override a weekly holiday for that date.
- Attendance-session generation uses the timetable entry plus the calendar rules. A calendar holiday creates no session even when the normal weekly timetable exists.

### New endpoints

- `GET /api/weekly-holidays/:academicYearId`
- `PUT /api/weekly-holidays/:academicYearId` body: `{ "weekdays": ["SATURDAY", "SUNDAY"] }`
- `GET /api/timetable-settings/:academicYearId`
- `PATCH /api/timetable-settings/:academicYearId` body: `{ "excludeWeeklyHolidaysFromTimetable": true }`
- `GET /api/timetable/academic-year/:academicYearId`
- `POST /api/timetable` body includes `attendanceRequired` and `isCustom`
- `PATCH /api/timetable/:id`
- `DELETE /api/timetable/:id`
- `POST /api/timetable/academic-year/:academicYearId/validate`
- `POST /api/timetable/academic-year/:academicYearId/publish`
- `POST /api/attendance-sessions/academic-year/:academicYearId/generate` body: `{ "date": "YYYY-MM-DD" }`


### Timetable examples

Normal weekly holiday: keep `isCustom=false` and the entry will not be allowed when `excludeWeeklyHolidaysFromTimetable=true`.

Sunday exception class: create the entry with `isCustom=true`. If `attendanceRequired=true`, attendance-session generation will create a session for that Sunday.

Non-attendance period: set `attendanceRequired=false`; the period remains visible in the timetable but no attendance session is created.

Specific calendar holiday: use `AcademicCalendar.dayType = HOLIDAY` (or `VACATION`). The recurring timetable remains unchanged, but attendance-session generation skips that date.

Special working day: use `AcademicCalendar.dayType = WORKING_DAY` for the date. This overrides the weekly-holiday exclusion for that date.


## Production
See `PRODUCTION_TIME_AND_DEPLOYMENT.md`. The backend uses Asia/Kolkata as its business timezone. `GET /api/system/time` exposes the current application date/time for debugging.

## Users, roles & permissions (RBAC)

Administrators can create users and decide exactly what each one may do. No database
migration is needed: this uses the existing `User`, `Role`, `Permission`, `UserRole`
and `RolePermission` tables.

| Endpoint | Permission |
| --- | --- |
| `GET /api/users`, `GET /api/users/:id` | `users.view` |
| `POST /api/users` | `users.create` |
| `PATCH /api/users/:id` (name, email, password, `roleIds`, `permissions`) | `users.update` |
| `PATCH /api/users/:id/status` `{ isActive }` | `users.deactivate` |
| `GET /api/roles` | `roles.view` (or `users.create/update`) |
| `POST / PATCH / DELETE /api/roles` | `roles.create / update / delete` |
| `GET /api/permissions` (grouped catalogue, dependencies, presets) | `roles.view` (or `users.create/update`) |

How access is stored
- A user gets **roles** (reusable bundles) and/or **specific permissions**. Specific
  permissions are kept in a hidden per-user role named `user:<userId>`; it is never
  listed on the Roles screen.
- `ADMIN` is a superuser: it always has every permission defined in
  `src/permissions/permission.constants.js`, even before the seed is re-run.
- Granting a permission automatically grants what it needs to work (for example
  `timetable.create` also grants `timetable.view`, `subjects.view`, `standards.view`,
  `period.view`, `calendar.view`, `academic_year.view`). The rules live in
  `src/permissions/permission-catalog.js`.
- New permissions `subject_allocation.view/create/update/delete` control allocating
  subjects to standards (previously this reused `subjects.*`).

Safety rules enforced by the API
- A non-admin can only grant permissions they hold themselves, and can never assign
  the `ADMIN` role or modify an administrator account.
- Nobody can change their own roles/permissions or deactivate themselves.
- The last active administrator cannot be removed or deactivated.
- Built-in roles (`ADMIN`, `STAFF`, `ATTENDANCE_MANAGER`) are read-only; create a new
  role for custom bundles.
- Permission checks that had been removed from the generic CRUD routes
  (standards, subjects, students, absence types) are back, with a field whitelist.

On startup the server inserts any permission that exists in code but not yet in the
database. Re-running `npm run prisma:seed` is optional.

`/api/auth/me` and `/api/auth/login` now also return `portal`: `"admin"` (management
portal, menus limited to granted permissions) or `"staff"` (teacher portal).

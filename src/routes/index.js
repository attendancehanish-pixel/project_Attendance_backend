

import { Router } from 'express';
import P from '../permissions/permission.constants.js';
import crud from './crud.routes.js';
import authRoutes from './auth.routes.js';
import academicYearsRoutes from './academic-years.routes.js';
import calendarRoutes from './calendar.routes.js';
import attendanceRoutes from './attendance.routes.js';
import attendanceCorrectionsRoutes from './attendance-corrections.routes.js';
import reportsRoutes from './reports.routes.js';
import placeholderRoutes from './placeholder.routes.js';
import timetableRoutes from './timetable.routes.js';
import timetableSettingsRoutes from './timetable-settings.routes.js';
import weeklyHolidayRoutes from './weekly-holiday.routes.js';
import attendanceSessionRoutes from './attendance-session.routes.js';
import attendanceAdjustmentRoutes from './attendance-adjustments.routes.js';
import staffRoutes from './staff.router.js';
import staffAssignmentRoutes from './staff-assignment.routes.js';
import subjectAllocationRoutes from './subject-allocations.routes.js';
import periodConfigurationRoutes from './period-configuration.routes.js';
import periodRoutes from './period.routes.js';
import dateSpecificTimetableRoutes from './date-specific-timetable.routes.js';
import studentEnrollmentRoutes from './student-enrollment.routes.js';
import staffTimetableRoutes from './staff-timetable.routes.js';
import staffStudentsRoutes from './staff-students.routes.js';
import attendanceLeaveRoutes from './attendance.leave.routes.js';

const r = Router();

r.use('/auth', authRoutes);
r.use('/academic-years', academicYearsRoutes);
r.use('/calendar', calendarRoutes);
r.use('/attendance', attendanceRoutes);
r.use('/attendance/corrections', attendanceCorrectionsRoutes);
r.use('/attendance/adjustments', attendanceAdjustmentRoutes);
r.use('/attendance/leave', attendanceLeaveRoutes);

r.use('/reports', reportsRoutes);

r.use('/period-configuration', periodConfigurationRoutes);
r.use('/periods', periodRoutes);
r.use('/timetable', timetableRoutes);
r.use('/timetable/date-specific', dateSpecificTimetableRoutes);
r.use('/timetable-settings', timetableSettingsRoutes);
r.use('/weekly-holidays', weeklyHolidayRoutes);

r.use('/attendance-sessions', attendanceSessionRoutes);
r.use('/staff-leaves', placeholderRoutes);
r.use('/student-leaves', placeholderRoutes);
r.use('/substitutions', placeholderRoutes);
r.use('/notifications', placeholderRoutes);
r.use('/subject-allocations', subjectAllocationRoutes);
r.use('/assignments', staffAssignmentRoutes);
r.use('/student-enrollments', studentEnrollmentRoutes);
r.use('/staff', staffRoutes);
r.use('/staff/timetable', staffTimetableRoutes);
r.use("/staff/students", staffStudentsRoutes);
r.use(
  '/standards',
  crud('standard', {
    view: P.STANDARDS_VIEW,
    create: P.STANDARDS_CREATE,
    update: P.STANDARDS_UPDATE,
    remove: P.STANDARDS_DELETE,
  })
);

r.use(
  '/subjects',
  crud('subject', {
    view: P.SUBJECTS_VIEW,
    create: P.SUBJECTS_CREATE,
    update: P.SUBJECTS_UPDATE,
    remove: P.SUBJECTS_DELETE,
  })
);

r.use(
  '/absence-types',
  crud('studentAbsenceType', {
    view: P.ABSENCE_TYPE_VIEW,
    create: P.ABSENCE_TYPE_CREATE,
    update: P.ABSENCE_TYPE_UPDATE,
    remove: P.ABSENCE_TYPE_DEACTIVATE,
  })
);

r.use(
  '/students',
  crud('student', {
    view: P.STUDENTS_VIEW,
    create: P.STUDENTS_CREATE,
    update: P.STUDENTS_UPDATE,
    remove: P.STUDENTS_ARCHIVE,
  })
);

export default r;

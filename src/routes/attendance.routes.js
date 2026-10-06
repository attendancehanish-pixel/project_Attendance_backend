// import { Router } from 'express';
// import { authenticate } from '../middleware/authenticate.js';
// import { requirePermission } from '../middleware/authorize.js';
// import P from '../permissions/permission.constants.js';
// import { requireAttendanceSessionStaffRelation } from '../middleware/relation.js';
// import * as attendanceController from '../controllers/attendance.controller.js';
// import asyncHandler from '../utils/async-handler.js';

// const router = Router();

// router.get('/mine', authenticate,  asyncHandler(attendanceController.listMine));
// router.get('/review/options', authenticate,  asyncHandler(attendanceController.reviewOptions));
// router.get('/review/subjects', authenticate,  asyncHandler(attendanceController.reviewSubjects));
// router.get('/review/students', authenticate,  asyncHandler(attendanceController.reviewStudents));
// router.get('/review/students/:studentId', authenticate,  asyncHandler(attendanceController.reviewStudent));
// router.get('/sessions/:sessionId', authenticate,  asyncHandler(attendanceController.getSession));
// router.post(
//   '/sessions/:sessionId/mark',
//   authenticate,
//   requirePermission(P.ATTENDANCE_MARK),
//   requireAttendanceSessionStaffRelation,
//   asyncHandler(attendanceController.markAttendance),
// );

// export default router;


import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import P from '../permissions/permission.constants.js';
import { requireAttendanceSessionStaffRelation } from '../middleware/relation.js';
import * as attendanceController from '../controllers/attendance.controller.js';
import { getCurrentAttendance } from '../controllers/attendance.current.controller.js';
import asyncHandler from '../utils/async-handler.js';

const router = Router();

router.get('/mine', authenticate,  asyncHandler(attendanceController.listMine));
router.get('/review/options', authenticate,  asyncHandler(attendanceController.reviewOptions));
router.get('/review/subjects', authenticate,  asyncHandler(attendanceController.reviewSubjects));
router.get('/review/students', authenticate,  asyncHandler(attendanceController.reviewStudents));
router.get('/review/students/:studentId', authenticate,  asyncHandler(attendanceController.reviewStudent));
router.get('/sessions/:sessionId/students', authenticate,  asyncHandler(attendanceController.getSession));
router.get('/current', authenticate, asyncHandler(getCurrentAttendance));
router.post(
  '/sessions/:sessionId/mark',
  authenticate,
  // requireAttendanceSessionStaffRelation,
  asyncHandler(attendanceController.markAttendance),
);

export default router;

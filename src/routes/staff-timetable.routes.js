import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  getMyWeeklyTimetableController,
  getMyTodayPeriodsController,
  getClassListController,
  getClassTimetableController,
  getTimetableChangesController,
} from "../controllers/staff-timetable.controller.js";

const router = Router();

/* My timetable */
router.get("/me", authenticate, getMyWeeklyTimetableController);
router.get("/me/today", authenticate, getMyTodayPeriodsController);

/* Class timetable */
router.get("/classes", authenticate, getClassListController);
router.get("/classes/:standardId", authenticate, getClassTimetableController);

/* Changes */
router.get("/changes", authenticate, getTimetableChangesController);

export default router;
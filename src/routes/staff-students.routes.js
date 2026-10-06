import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  listStudentsController,
  getStudentDetailsController,
  getStudentAbsenceSessionsController,
  getStudentFilterOptionsController,
} from "../controllers/staff-students.controller.js";

const router = Router();

/* Filter options (classes) */
router.get("/filter-options", authenticate, getStudentFilterOptionsController);

/* List + search */
router.get("/", authenticate, listStudentsController);

/* Single student */
router.get("/:studentId", authenticate, getStudentDetailsController);

/* Absence sessions */
router.get(
  "/:studentId/absences",
  authenticate,
  getStudentAbsenceSessionsController
);

export default router;
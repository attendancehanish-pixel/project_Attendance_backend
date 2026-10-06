import {
  getMyWeeklyTimetable,
  getClassTimetable,
  getClassList,
  getTimetableChanges,
  getMyTodayPeriods,
} from "../services/staff-timetable.service.js";

/* ------------------------------------------------------------------ */
/* Shared error handler                                                */
/* ------------------------------------------------------------------ */

function handleError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error instanceof Error) {
    if (error.message === "Staff profile not found") {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === "Class not found") {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === "No active academic year found") {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  return res.status(500).json({ success: false, message: fallbackMessage });
}

/* ------------------------------------------------------------------ */
/* Controllers                                                         */
/* ------------------------------------------------------------------ */

export const getMyWeeklyTimetableController = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await getMyWeeklyTimetable(userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch your timetable");
  }
};

export const getMyTodayPeriodsController = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const result = await getMyTodayPeriods(userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch today's periods");
  }
};

export const getClassListController = async (req, res) => {
  try {
    const result = await getClassList();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch classes");
  }
};

export const getClassTimetableController = async (req, res) => {
  try {
    const { standardId } = req.params;
    if (!standardId) {
      return res
        .status(400)
        .json({ success: false, message: "standardId is required" });
    }

    const result = await getClassTimetable(standardId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch class timetable");
  }
};

export const getTimetableChangesController = async (req, res) => {
  try {
    const { standardId, from, to } = req.query;

    const result = await getTimetableChanges({ standardId, from, to });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch timetable changes");
  }
};
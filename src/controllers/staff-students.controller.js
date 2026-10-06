import {
  listStudents,
  getStudentDetails,
  getStudentAbsenceSessions,
  getStudentFilterOptions,
} from "../services/staff-students.service.js";

function handleError(res, error, fallback) {
  console.error(fallback, error);
  if (error instanceof Error) {
    if (error.message === "Staff profile not found")
      return res.status(404).json({ success: false, message: error.message });
    if (error.message === "Student not found")
      return res.status(404).json({ success: false, message: error.message });
    if (error.message === "No active academic year found")
      return res.status(400).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: fallback });
}

export const listStudentsController = async (req, res) => {
  try {
  
    const {
      search,
      standardId,
      status,
      page,
      pageSize,
      sortBy,
      sortDir,
    } = req.query;

    const result = await listStudents({
      userId,
      search,
      standardId,
      status,
      page,
      pageSize,
      sortBy,
      sortDir,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch students");
  }
};

export const getStudentDetailsController = async (req, res) => {
  try {
  
    const result = await getStudentDetails({
      userId,
      studentId: req.params.studentId,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch student");
  }
};

export const getStudentAbsenceSessionsController = async (req, res) => {
  try {
  
    const { from, to, limit } = req.query;

    const result = await getStudentAbsenceSessions({
      userId,
      studentId: req.params.studentId,
      from,
      to,
      limit,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch absence sessions");
  }
};

export const getStudentFilterOptionsController = async (req, res) => {
  try {
  
    const result = await getStudentFilterOptions();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, "Failed to fetch filter options");
  }
};
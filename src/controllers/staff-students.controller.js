import {
  listStudents,
  getStudentDetails,
  getStudentAbsenceSessions,
  getStudentFilterOptions,
} from '../services/staff-students.service.js';

function handleError(res, error, fallback) {
  console.error(fallback, error);

  if (error instanceof Error) {
    if (error.message === 'Staff profile not found' || error.message === 'Student not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === 'No active academic year found') {
      return res.status(400).json({ success: false, message: error.message });
    }
    // ApiError (e.g. invalid date) carries its own status.
    if (error.status && error.status < 500) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
  }

  return res.status(500).json({ success: false, message: fallback });
}

const currentUserId = (req) => req.user?.id || req.user?.userId || req.auth?.userId;

export const listStudentsController = async (req, res) => {
  try {
    const { search, standardId, status, page, pageSize, sortBy, sortDir } = req.query;

    const result = await listStudents({
      userId: currentUserId(req),
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
    return handleError(res, error, 'Failed to fetch students');
  }
};

export const getStudentDetailsController = async (req, res) => {
  try {
    const result = await getStudentDetails({
      userId: currentUserId(req),
      studentId: req.params.studentId,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, 'Failed to fetch student');
  }
};

export const getStudentAbsenceSessionsController = async (req, res) => {
  try {
    const { from, to } = req.query;

    const result = await getStudentAbsenceSessions({
      userId: currentUserId(req),
      studentId: req.params.studentId,
      from,
      to,
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, 'Failed to fetch absence sessions');
  }
};

export const getStudentFilterOptionsController = async (req, res) => {
  try {
    const result = await getStudentFilterOptions();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, 'Failed to fetch filter options');
  }
};

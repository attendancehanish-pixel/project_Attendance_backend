import * as service from '../services/attendance.service.js';

export const listMine = async (req, res) => {
  const { cursor, limit } = req.query;

  const result = await service.listForStaff(req.user.id, { cursor, limit });

  res.json(result); 
}

export const getSession = async (req, res) =>
  res.json({
    data: await service.getStudentsForSession(
      req.params.sessionId,
      req.user.id
    ),
  });
export const markAttendance = async (req, res) => {
 
  res.json({
    data: await service.mark({
      sessionId: req.params.sessionId,
      staffId: req.user.id,
      records: req.body.records || [],
    }),

  });
}


export const reviewOptions = async (req, res) =>
  res.json({ data: await service.reviewOptions() });

export const reviewSubjects = async (req, res) =>
  res.json({
    data: await service.reviewSubjects({
      standardId: req.query.standardId,
      subjectId: req.query.subjectId,
      from: req.query.from,
      to: req.query.to,
    }),
  });

export const reviewStudents = async (req, res) =>
  res.json({ data: await service.reviewStudents({ standardId: req.query.standardId }) });

export const reviewStudent = async (req, res) =>
  res.json({
    data: await service.reviewStudent({
      studentId: req.params.studentId,
      from: req.query.from,
      to: req.query.to,
    }),
  });

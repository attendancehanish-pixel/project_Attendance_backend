import * as service from '../services/attendance-report.service.js';

export const getDailyReport = async (req, res) =>
  res.json({
    data: await service.getDailyReport({
      date: req.query.date,
      academicYearId: req.query.academicYearId,
    }),
  });

export const getSessionReport = async (req, res) =>
  res.json({ data: await service.getSessionReport(req.params.sessionId) });

export const getUnmarkedReport = async (req, res) =>
  res.json({
    data: await service.getUnmarkedReport({
      academicYearId: req.query.academicYearId,
      from: req.query.from,
      to: req.query.to,
      standardId: req.query.standardId,
      staffId: req.query.staffId,
      page: req.query.page,
      pageSize: req.query.pageSize,
    }),
  });

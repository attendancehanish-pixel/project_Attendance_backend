import * as service from '../services/attendance-session.service.js';

export const generate = async (req, res) =>
  res.json({ data: await service.generateForDate(req.params.academicYearId, req.body.date) });

// Body is either { from, to } (explicit range) or { days } (next N days,
// defaults to 7 — i.e. "generate next week").
export const generateRange = async (req, res) => {
  const { from, to, days } = req.body || {};

  const result = from && to
    ? await service.generateForDateRange(req.params.academicYearId, { from, to })
    : await service.generateForNextDays(req.params.academicYearId, days || 7);

  res.json({ data: result });
};

export const list = async (req, res) => {
  const { academicYearId } = req.params;
  const { from, to, standardId, staffId, status, source } = req.query;

  const data = await service.listSessionsGrouped(academicYearId, {
    from,
    to,
    standardId,
    staffId,
    status,
    source,
  });

  res.json({ data });
};
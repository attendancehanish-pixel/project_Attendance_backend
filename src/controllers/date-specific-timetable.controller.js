import * as service from '../services/date-specific-timetable.service.js';

export const list = async (req, res) =>
  res.json({
    data: await service.list(
      req.params.academicYearId,
      req.query.date,
      req.query.standardId
    ),
  });

export const create = async (req, res) =>
  res.status(201).json({
    data: await service.create(req.params.academicYearId, req.body),
  });

export const update = async (req, res) =>
  res.json({ data: await service.update(req.params.id, req.body) });

export const remove = async (req, res) =>
  res.json({ data: await service.remove(req.params.id) });

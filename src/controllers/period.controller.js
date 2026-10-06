import * as service from '../services/period.service.js';

export const list = async (req, res) =>
  res.json({ data: await service.list(req.params.academicYearId, req.query.weekday) });

export const get = async (req, res) =>
  res.json({ data: await service.get(req.params.id) });

export const create = async (req, res) =>
  res.status(201).json({
    data: await service.create(req.params.academicYearId, req.body),
  });

export const update = async (req, res) =>
  res.json({ data: await service.update(req.params.id, req.body) });

export const remove = async (req, res) =>
  res.json({ data: await service.remove(req.params.id) });

export const generate = async (req, res) =>
  res.status(201).json({
    data: await service.generate(req.params.academicYearId, req.body || {}),
  });

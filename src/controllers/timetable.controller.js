import * as service from '../services/timetable.service.js';

export const list = async (req, res) =>
  res.json({ data: await service.list(req.params.academicYearId, req.query.standardId) });

export const create = async (req, res) =>
  res.status(201).json({ data: await service.create(req.body) });

export const update = async (req, res) =>
  res.json({ data: await service.update(req.params.id, req.body) });

export const remove = async (req, res) =>
  res.json({ data: await service.remove(req.params.id) });

export const validate = async (req, res) =>
  res.json({ data: await service.validate(req.params.academicYearId) });

export const publish = async (req, res) =>
  res.json({ data: await service.publish(req.params.academicYearId) });

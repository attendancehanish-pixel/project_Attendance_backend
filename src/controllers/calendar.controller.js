import * as service from '../services/calendar.service.js';

export const list = async (req, res) =>
  res.json({ data: await service.list(req.params.academicYearId) });

export const month = async (req, res) =>
  res.json({
    data: await service.month(
      req.params.academicYearId,
      req.query.year,
      req.query.month
    ),
  });

export const createOverride = async (req, res) =>
  res.status(201).json({
    data: await service.createOverride(req.params.academicYearId, req.body),
  });

export const updateOverride = async (req, res) =>
  res.json({ data: await service.updateOverride(req.params.id, req.body) });

export const removeOverride = async (req, res) =>
  res.json({ data: await service.removeOverride(req.params.id) });

export const listCategories = async (req, res) =>
  res.json({ data: await service.listCategories() });

export const createCategory = async (req, res) =>
  res.status(201).json({ data: await service.createCategory(req.body) });

export const updateCategory = async (req, res) =>
  res.json({ data: await service.updateCategory(req.params.id, req.body) });

export const removeCategory = async (req, res) =>
  res.json({ data: await service.removeCategory(req.params.id) });

export const listExceptions = async (req, res) =>
  res.json({ data: await service.listExceptions(req.params.academicYearId) });

export const createException = async (req, res) =>
  res.status(201).json({
    data: await service.createException(req.params.academicYearId, req.body),
  });

export const updateException = async (req, res) =>
  res.json({ data: await service.updateException(req.params.id, req.body) });

export const removeException = async (req, res) =>
  res.json({ data: await service.removeException(req.params.id) });

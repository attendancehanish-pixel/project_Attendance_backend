import * as service from '../services/period-configuration.service.js';

export const generate = async (req, res) =>
  res.json({ data: await service.generate(req.params.academicYearId, req.body) });

export const get = async (req, res) =>
  res.json({ data: await service.get(req.params.academicYearId) });

export const upsert = async (req, res) =>
  res.json({ data: await service.upsert(req.params.academicYearId, req.body) });

export const getSetup = async (req, res) =>
  res.json({ data: await service.getSetup(req.params.academicYearId) });

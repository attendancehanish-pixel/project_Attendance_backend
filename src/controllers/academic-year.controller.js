import * as service from '../services/academic-year.service.js';

export const list = async (req, res) => 
  res.json({ data: await service.list() });

export const create = async (req, res) =>
  res.status(201).json({ data: await service.create(req.body) });

export const update = async (req, res) =>
  res.json({ data: await service.update(req.params.id, req.body) });

export const activate = async (req, res) =>
  res.json({ data: await service.activate(req.params.id) });

export const complete = async (req, res) =>
  res.json({ data: await service.complete(req.params.id) });
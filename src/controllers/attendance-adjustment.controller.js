import * as service from '../services/attendance-adjustment.service.js';

export const create = async (req, res) =>
  res.status(201).json({
    data: await service.create({
      ...req.body,
      createdById: req.user.id,
    }),
  });

export const listForStudent = async (req, res) =>
  res.json({
    data: await service.listForStudent({
      studentId: req.params.studentId,
      academicYearId: req.query.academicYearId,
    }),
  });

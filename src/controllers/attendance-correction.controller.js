import { 
  request as requestService, 
  approve as approveService, 
  reject as rejectService 
} from '../services/attendance-correction.service.js';

export const request = async (req, res) =>
  res.status(201).json({
    data: await requestService({ ...req.body, requestedById: req.user.id }),
  });

export const approve = async (req, res) =>
  res.json({ data: await approveService(req.params.id, req.user.id) });

export const reject = async (req, res) =>
  res.json({ data: await rejectService(req.params.id, req.user.id) });
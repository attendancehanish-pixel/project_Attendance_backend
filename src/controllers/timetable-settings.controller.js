import * as service from '../services/timetable-settings.service.js';
export const get = async (req,res)=>res.json({data: await service.get(req.params.academicYearId)});
export const update = async (req,res)=>res.json({data: await service.update(req.params.academicYearId, req.body)});

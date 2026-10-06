import * as service from '../services/weekly-holiday.service.js';
export const list=async(req,res)=>res.json({data:await service.list(req.params.academicYearId)});
export const replace=async(req,res)=>res.json({data:await service.replace(req.params.academicYearId,req.body.weekdays)});

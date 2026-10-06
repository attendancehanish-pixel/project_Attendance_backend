import prisma from '../lib/prisma.js';
import { ApiError } from '../utils/api-error.js';
const weekdays = new Set(['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']);
export const list = (academicYearId)=>prisma.weeklyHoliday.findMany({where:{academicYearId},orderBy:{weekday:'asc'}});
export const replace = async (academicYearId, values)=>{
  if(!Array.isArray(values)) throw new ApiError(400,'weekdays must be an array');
  const normalized=[...new Set(values.map(v=>String(v).toUpperCase()))];
  if(normalized.some(v=>!weekdays.has(v))) throw new ApiError(400,'Invalid weekday');
  const year=await prisma.academicYear.findUnique({where:{id:academicYearId}}); if(!year) throw new ApiError(404,'Academic year not found');
  return prisma.$transaction(async tx=>{ await tx.weeklyHoliday.deleteMany({where:{academicYearId}}); if(normalized.length) await tx.weeklyHoliday.createMany({data:normalized.map(weekday=>({academicYearId,weekday}))}); return tx.weeklyHoliday.findMany({where:{academicYearId},orderBy:{weekday:'asc'}}); });
};

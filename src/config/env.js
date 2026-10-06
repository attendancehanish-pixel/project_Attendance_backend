import dotenv from 'dotenv';

dotenv.config();
process.env.APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

if (process.env.NODE_ENV === 'production') {
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required`);
    }
  }
}

export const port = Number(process.env.PORT || 4000);
export const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
export const nodeEnv = process.env.NODE_ENV || 'development';
export const accessSecret = process.env.JWT_ACCESS_SECRET || 'dev-access-secret';
export const refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
export const accessMinutes = Number(process.env.ACCESS_TOKEN_MINUTES || 15);
export const refreshDays = Number(process.env.REFRESH_TOKEN_DAYS || 7);
export const resetMinutes = Number(process.env.PASSWORD_RESET_MINUTES || 30);
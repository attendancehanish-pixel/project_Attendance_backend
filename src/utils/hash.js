import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const hashPassword = (value) => bcrypt.hash(value, 12);
export const comparePassword = (value, hash) => bcrypt.compare(value, hash);
export const randomToken = () => crypto.randomBytes(48).toString('hex');
export const hashToken = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');
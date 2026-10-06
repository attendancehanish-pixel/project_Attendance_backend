import jwt from 'jsonwebtoken';
import { accessSecret, accessMinutes } from '../config/env.js';

export const signAccessToken = (userId) =>
  jwt.sign({ sub: userId }, accessSecret, { expiresIn: `${accessMinutes}m` });

export const verifyAccessToken = (token) => jwt.verify(token, accessSecret);

// ✅ Add default export
export default {
  signAccessToken,
  verifyAccessToken
};
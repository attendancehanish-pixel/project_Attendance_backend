import prisma from '../lib/prisma.js';
import { signAccessToken } from '../lib/jwt.js';
import { randomToken, hashToken } from '../utils/hash.js';
import { refreshDays } from '../config/env.js';
import * as service from '../services/auth.service.js';
import { ApiError } from '../utils/api-error.js';

export const login = async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const x = await service.login(email, password);

  res.cookie('refreshToken', x.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: refreshDays * 86400000,
  });

  res.json({ accessToken: x.accessToken, user: x.user });
};

export const me = async (req, res) =>
  res.json({ user: service.publicUser(req.user) });

export const refresh = async (req, res) => {
  const raw = req.cookies.refreshToken;
  if (!raw) throw new ApiError(401, 'No refresh token');

  const old = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });

  if (!old || old.revokedAt || old.expiresAt < new Date()) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  await prisma.refreshToken.update({
    where: { id: old.id },
    data: { revokedAt: new Date() },
  });

  const next = randomToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(next),
      userId: old.userId,
      expiresAt: new Date(Date.now() + refreshDays * 86400000),
    },
  });

  res.cookie('refreshToken', next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: refreshDays * 86400000,
  });

  res.json({ accessToken: signAccessToken(old.userId) });
};

export const logout = async (req, res) => {
  const raw = req.cookies.refreshToken;
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
};

// ✅ Add default export
export default {
  login,
  me,
  refresh,
  logout,
};
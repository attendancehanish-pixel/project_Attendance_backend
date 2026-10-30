import prisma from '../lib/prisma.js';
import { signAccessToken } from '../lib/jwt.js';
import { randomToken, hashToken } from '../utils/hash.js';
import { refreshDays, mobileRefreshDays } from '../config/env.js';
import * as service from '../services/auth.service.js';
import { ApiError } from '../utils/api-error.js';

// The web app keeps the refresh token in an httpOnly cookie. A native mobile
// app cannot use that cookie, so when it identifies itself (client: "mobile",
// or the X-Client header) the refresh token travels in the JSON body instead
// and it gets a longer, sliding lifetime. No database change is involved.
const isMobileClient = (req) =>
  req.body?.client === 'mobile' || req.headers['x-client'] === 'mobile';

const cookieOptions = (days) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: days * 86400000,
});

export const login = async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const mobile = isMobileClient(req);

  const x = await service.login(email, password, {
    days: mobile ? mobileRefreshDays : refreshDays,
  });

  if (mobile) {
    return res.json({
      accessToken: x.accessToken,
      refreshToken: x.refreshToken,
      user: x.user,
    });
  }

  res.cookie('refreshToken', x.refreshToken, cookieOptions(refreshDays));
  res.json({ accessToken: x.accessToken, user: x.user });
};

export const me = async (req, res) =>
  res.json({ user: service.publicUser(req.user) });

export const refresh = async (req, res) => {
  const mobile = Boolean(req.body?.refreshToken) || isMobileClient(req);
  const raw = mobile ? req.body?.refreshToken : req.cookies.refreshToken;
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

  const days = mobile ? mobileRefreshDays : refreshDays;
  const next = randomToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(next),
      userId: old.userId,
      expiresAt: new Date(Date.now() + days * 86400000),
    },
  });

  if (mobile) {
    return res.json({ accessToken: signAccessToken(old.userId), refreshToken: next });
  }

  res.cookie('refreshToken', next, cookieOptions(refreshDays));
  res.json({ accessToken: signAccessToken(old.userId) });
};

export const logout = async (req, res) => {
  const raw = req.cookies.refreshToken || req.body?.refreshToken;
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current and new password are required');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters');
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from current password');
  }

  await service.changePassword(req.user.id, currentPassword, newPassword);

  // Clear refresh cookie since all tokens were revoked
  res.clearCookie('refreshToken');

  res.json({ message: 'Password changed. Please log in again.' });
};


export default {
  login,
  me,
  refresh,
  logout,
  changePassword,
};
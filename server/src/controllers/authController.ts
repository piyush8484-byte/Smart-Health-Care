import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { DoctorProfile, PatientProfile } from '../models/Clinical';
import { RefreshSession } from '../models/RefreshSession';
import { User, UserRole } from '../models/User';
import { sendEmail } from '../services/email';
import { AppError } from '../utils/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(10).max(128),
  role: z.enum(['PATIENT', 'DOCTOR']),
  specialization: z.string().trim().min(2).max(100).optional(),
  licenseNumber: z.string().trim().min(3).max(80).optional()
}).superRefine((input, context) => {
  if (input.role === 'DOCTOR' && (!input.specialization || !input.licenseNumber)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Doctors must provide specialization and license number' });
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(20), password: z.string().min(10).max(128) });

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function refreshLifetimeMs(): number {
  const match = env.JWT_REFRESH_TTL.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error('JWT_REFRESH_TTL must be a duration such as 15m or 7d');
  const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return Number(match[1]) * unitMs;
}

async function issueTokens(user: { _id: unknown; email: string; role: UserRole }) {
  const session = await RefreshSession.create({
    userId: user._id,
    tokenHash: 'pending',
    expiresAt: new Date(Date.now() + refreshLifetimeMs())
  });
  const tokenUser = { id: String(user._id), email: user.email, role: user.role };
  const refreshToken = signRefreshToken(tokenUser, String(session._id));
  session.tokenHash = hashToken(refreshToken);
  await session.save();
  return { accessToken: signAccessToken(tokenUser), refreshToken };
}

export async function register(request: Request, response: Response): Promise<void> {
  const input = registerSchema.parse(request.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash,
    role: input.role,
    isApproved: input.role === 'PATIENT'
  });
  if (input.role === 'PATIENT') {
    await PatientProfile.create({ userId: user._id });
  } else {
    await DoctorProfile.create({ userId: user._id, specialization: input.specialization, licenseNumber: input.licenseNumber });
  }
  const tokens = await issueTokens(user);
  response.status(201).json({
    success: true,
    message: input.role === 'DOCTOR' ? 'Account created; administrator approval is pending' : 'Account created',
    data: { user: { id: user.id, name: user.name, email: user.email, role: user.role, isApproved: user.isApproved }, ...tokens }
  });
}

export async function login(request: Request, response: Response): Promise<void> {
  const input = loginSchema.parse(request.body);
  const user = await User.findOne({ email: input.email.toLowerCase(), isActive: true }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, 'Email or password is incorrect');
  }
  const tokens = await issueTokens(user);
  response.json({
    success: true,
    message: 'Signed in',
    data: { user: { id: user.id, name: user.name, email: user.email, role: user.role, isApproved: user.isApproved }, ...tokens }
  });
}

export async function refresh(request: Request, response: Response): Promise<void> {
  const token = z.object({ refreshToken: z.string().min(1) }).parse(request.body).refreshToken;
  let claims;
  try {
    claims = verifyRefreshToken(token);
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token');
  }
  const session = await RefreshSession.findById(claims.sessionId);
  if (!session || session.tokenHash !== hashToken(token) || session.expiresAt <= new Date()) {
    throw new AppError(401, 'Refresh session is no longer valid');
  }
  const user = await User.findById(claims.id);
  if (!user || !user.isActive) {
    await session.deleteOne();
    throw new AppError(401, 'Account is unavailable');
  }
  const tokenUser = { id: user.id, email: user.email, role: user.role };
  const nextRefresh = signRefreshToken(tokenUser, session.id);
  session.tokenHash = hashToken(nextRefresh);
  session.expiresAt = new Date(Date.now() + refreshLifetimeMs());
  await session.save();
  response.json({ success: true, message: 'Token refreshed', data: { accessToken: signAccessToken(tokenUser), refreshToken: nextRefresh } });
}

export async function logout(request: Request, response: Response): Promise<void> {
  const input = z.object({ refreshToken: z.string().min(1) }).parse(request.body);
  try {
    const claims = verifyRefreshToken(input.refreshToken);
    const session = await RefreshSession.findById(claims.sessionId);
    if (session?.tokenHash === hashToken(input.refreshToken)) await session.deleteOne();
  } catch {
    // Logout remains idempotent for expired or already-revoked refresh tokens.
  }
  response.json({ success: true, message: 'Signed out', data: null });
}

export async function forgotPassword(request: Request, response: Response): Promise<void> {
  const { email } = forgotSchema.parse(request.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    const token = randomBytes(32).toString('hex');
    user.set({ resetTokenHash: hashToken(token), resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000) });
    await user.save();
    const resetUrl = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;
    await sendEmail(user.email, 'Reset your Smart Healthcare password', `Use this link within 30 minutes: ${resetUrl}`);
    if (env.NODE_ENV !== 'production') console.info(`Password reset link for ${user.email}: ${resetUrl}`);
  }
  response.json({ success: true, message: 'If that account exists, a reset link has been sent', data: null });
}

export async function resetPassword(request: Request, response: Response): Promise<void> {
  const input = resetSchema.parse(request.body);
  const user = await User.findOne({ resetTokenHash: hashToken(input.token), resetTokenExpiresAt: { $gt: new Date() } }).select('+passwordHash +resetTokenHash');
  if (!user) throw new AppError(400, 'Password reset token is invalid or expired');
  user.passwordHash = await bcrypt.hash(input.password, 12);
  user.set({ resetTokenHash: undefined, resetTokenExpiresAt: undefined });
  await user.save();
  await RefreshSession.deleteMany({ userId: user._id });
  response.json({ success: true, message: 'Password updated; sign in again', data: null });
}

export async function currentUser(request: Request, response: Response): Promise<void> {
  const user = await User.findById(request.user?.id).select('-passwordHash');
  if (!user) throw new AppError(404, 'User not found');
  response.json({ success: true, message: 'Current user', data: user });
}
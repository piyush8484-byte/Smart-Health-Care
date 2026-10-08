import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { z } from 'zod';
import { createId, readFileStore, updateFileStore, type LocalRole, type LocalUser } from '../data/fileStore';
import { AppError } from '../utils/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(10).max(128),
  confirmPassword: z.string().min(1),
  role: z.enum(['patient', 'doctor', 'PATIENT', 'DOCTOR']).transform((role) => role.toUpperCase() as 'PATIENT' | 'DOCTOR'),
  specialization: z.string().trim().min(2).max(100).optional(),
  licenseNumber: z.string().trim().min(3).max(80).optional()
}).superRefine((input, context) => {
  if (!(input.fullName || input.name)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['fullName'], message: 'Full name is required' });
  if (input.password !== input.confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match' });
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1)
});

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(user: LocalUser) {
  return { id: user._id, name: user.name, email: user.email, role: user.role, isApproved: user.isApproved };
}

async function issueSession(user: LocalUser) {
  const sessionId = createId();
  const claims = { id: user._id, email: user.email, role: user.role };
  const refreshToken = signRefreshToken(claims, sessionId);
  await updateFileStore((store) => {
    store.refreshSessions.push({
      id: sessionId,
      userId: user._id,
      tokenHash: tokenHash(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
    });
  });
  return { user: publicUser(user), accessToken: signAccessToken(claims), refreshToken };
}

export async function registerLocal(request: Request, response: Response): Promise<void> {
  const input = registrationSchema.parse(request.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const name = input.fullName ?? input.name!;
  const role = input.role as LocalRole;
  const user: LocalUser = {
    _id: createId(), name, email: input.email, passwordHash, role,
    isApproved: role === 'PATIENT', isActive: true, consentToShare: false, createdAt: new Date().toISOString(),
    ...(role === 'DOCTOR' ? { specialization: input.specialization || 'General Practice', licenseNumber: input.licenseNumber || 'Pending verification' } : {})
  };
  await updateFileStore((store) => {
    if (store.users.some((candidate) => candidate.email === input.email)) throw new AppError(409, 'An account with this email already exists. Sign in or reset your password.');
    store.users.push(user);
    if (role === 'PATIENT') store.patientProfiles.push({ userId: user._id, allergies: [], chronicConditions: [] });
    if (role === 'DOCTOR') store.doctorProfiles.push({ userId: user._id, specialization: user.specialization, licenseNumber: user.licenseNumber });
  });
  const session = await issueSession(user);
  response.status(201).json({
    success: true,
    message: 'Account created',
    data: { email: user.email, verificationRequired: false, session }
  });
}

export async function loginLocal(request: Request, response: Response): Promise<void> {
  const input = loginSchema.parse(request.body);
  const user = await readFileStore((store) => store.users.find((candidate) => candidate.email === input.email && candidate.isActive));
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) throw new AppError(401, 'Incorrect email or password.');
  response.json({ success: true, message: 'Signed in', data: await issueSession(user) });
}

export async function currentLocalUser(request: Request, response: Response): Promise<void> {
  const user = await readFileStore((store) => store.users.find((candidate) => candidate._id === request.user?.id));
  if (!user) throw new AppError(404, 'User not found');
  response.json({ success: true, message: 'Current user', data: { ...publicUser(user), consentToShare: user.consentToShare } });
}

export async function refreshLocal(request: Request, response: Response): Promise<void> {
  const input = z.object({ refreshToken: z.string().min(1) }).parse(request.body);
  let claims: ReturnType<typeof verifyRefreshToken>;
  try {
    claims = verifyRefreshToken(input.refreshToken);
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token');
  }
  const user = await readFileStore((store) => {
    const session = store.refreshSessions.find((candidate) => candidate.id === claims.sessionId);
    if (!session || session.tokenHash !== tokenHash(input.refreshToken) || Date.parse(session.expiresAt) <= Date.now()) return undefined;
    return store.users.find((candidate) => candidate._id === claims.id && candidate.isActive);
  });
  if (!user) throw new AppError(401, 'Refresh session is no longer valid');
  const nextRefreshToken = signRefreshToken({ id: user._id, email: user.email, role: user.role }, claims.sessionId);
  await updateFileStore((store) => {
    const session = store.refreshSessions.find((candidate) => candidate.id === claims.sessionId);
    if (session) {
      session.tokenHash = tokenHash(nextRefreshToken);
      session.expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    }
  });
  response.json({ success: true, message: 'Token refreshed', data: { accessToken: signAccessToken({ id: user._id, email: user.email, role: user.role }), refreshToken: nextRefreshToken } });
}

export async function logoutLocal(request: Request, response: Response): Promise<void> {
  const input = z.object({ refreshToken: z.string().min(1) }).safeParse(request.body);
  if (input.success) {
    await updateFileStore((store) => {
      store.refreshSessions = store.refreshSessions.filter((session) => session.tokenHash !== tokenHash(input.data.refreshToken));
    });
  }
  response.json({ success: true, message: 'Signed out', data: null });
}
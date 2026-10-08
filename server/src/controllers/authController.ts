import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { DoctorProfile, PatientProfile } from '../models/Clinical';
import { RefreshSession } from '../models/RefreshSession';
import { User, UserRole } from '../models/User';
import { sendEmail, type EmailDelivery } from '../services/email';
import { AppError } from '../utils/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/tokens';

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(10).max(128),
  confirmPassword: z.string().min(1),
  role: z.enum(['patient', 'doctor', 'PATIENT', 'DOCTOR']).transform((role) => role.toUpperCase() as 'PATIENT' | 'DOCTOR'),
  specialization: z.string().trim().min(2).max(100).optional(),
  licenseNumber: z.string().trim().min(3).max(80).optional()
}).superRefine((input, context) => {
  if (!(input.fullName || input.name)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fullName'], message: 'Full name is required' });
  }
  if (input.password !== input.confirmPassword) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match' });
  }
  if (input.role === 'DOCTOR' && (!input.specialization || !input.licenseNumber)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Doctors must provide specialization and license number' });
  }
});

const loginSchema = z.object({ email: z.string().trim().email().transform((email) => email.toLowerCase()), password: z.string().min(1) });
const verificationSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit verification code')
});
const forgotSchema = z.object({ email: z.string().trim().email().transform((email) => email.toLowerCase()) });
const resetSchema = z.object({ token: z.string().min(20), password: z.string().min(10).max(128) });

const VERIFICATION_EXPIRY_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashVerificationCode(code: string): Buffer {
  return createHmac('sha256', env.EMAIL_VERIFICATION_SECRET).update(code).digest();
}

async function sendVerificationCode(
  user: InstanceType<typeof User>,
  now = new Date(),
  enforceCooldown = false
): Promise<EmailDelivery> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const codeHash = hashVerificationCode(code).toString('hex');
  const previousSentAt = user.emailVerificationSentAt;
  const previousCodeHash = user.emailVerificationCodeHash;
  const previousExpiresAt = user.emailVerificationExpiresAt;
  const previousAttempts = user.emailVerificationAttempts;
  const verificationState = {
    emailVerificationCodeHash: codeHash,
    emailVerificationExpiresAt: new Date(now.getTime() + VERIFICATION_EXPIRY_MS),
    emailVerificationSentAt: now,
    emailVerificationAttempts: 0
  };
  if (enforceCooldown) {
    const cooldownBefore = new Date(now.getTime() - VERIFICATION_RESEND_COOLDOWN_MS);
    const updated = await User.findOneAndUpdate(
      {
        _id: user._id,
        emailVerified: false,
        $or: [
          { emailVerificationSentAt: { $exists: false } },
          { emailVerificationSentAt: null },
          { emailVerificationSentAt: { $lte: cooldownBefore } }
        ]
      },
      { $set: verificationState },
      { new: true }
    );
    if (!updated) throw new AppError(429, 'A verification code was just sent. Please wait before requesting another.');
  } else {
    Object.assign(user, verificationState);
    await user.save();
  }
  try {
    return await sendEmail(
      user.email,
      'Verify your Smart Healthcare account',
      `Your verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`
    );
  } catch (error: unknown) {
    if (enforceCooldown) {
      const restore: Record<string, unknown> = { emailVerificationAttempts: previousAttempts ?? 0 };
      const unset: Record<string, number> = {};
      if (previousCodeHash) restore.emailVerificationCodeHash = previousCodeHash;
      else unset.emailVerificationCodeHash = 1;
      if (previousExpiresAt) restore.emailVerificationExpiresAt = previousExpiresAt;
      else unset.emailVerificationExpiresAt = 1;
      if (previousSentAt) restore.emailVerificationSentAt = previousSentAt;
      else unset.emailVerificationSentAt = 1;
      await User.updateOne(
        { _id: user._id, emailVerificationCodeHash: codeHash },
        { $set: restore, $unset: unset }
      );
    } else {
      user.emailVerificationCodeHash = undefined;
      user.emailVerificationExpiresAt = undefined;
      user.emailVerificationSentAt = previousSentAt;
      user.emailVerificationAttempts = 0;
      await user.save();
    }
    console.error('Verification email delivery failed:', error instanceof Error ? error.message : 'Unknown error');
    throw new AppError(503, 'We could not send the verification email. Please try again later or contact the service administrator.');
  }
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
    name: input.fullName ?? input.name!,
    email: input.email,
    passwordHash,
    role: input.role,
    emailVerified: false,
    isApproved: input.role === 'PATIENT'
  });
  let delivery: EmailDelivery;
  try {
    if (input.role === 'PATIENT') {
      await PatientProfile.create({ userId: user._id });
    } else {
      await DoctorProfile.create({ userId: user._id, specialization: input.specialization, licenseNumber: input.licenseNumber });
    }
    delivery = await sendVerificationCode(user);
  } catch (error) {
    await Promise.all([
      input.role === 'PATIENT' ? PatientProfile.deleteOne({ userId: user._id }) : DoctorProfile.deleteOne({ userId: user._id }),
      User.deleteOne({ _id: user._id })
    ]);
    throw error;
  }
  response.status(201).json({
    success: true,
    message: delivery === 'development-console'
      ? 'Account created. The development verification code is in the API terminal.'
      : 'Account created. Enter the verification code sent to your email.',
    data: {
      email: user.email,
      verificationRequired: true,
      expiresInSeconds: VERIFICATION_EXPIRY_MS / 1000,
      cooldownSeconds: VERIFICATION_RESEND_COOLDOWN_MS / 1000,
      delivery
    }
  });
}

export async function verifyEmail(request: Request, response: Response): Promise<void> {
  const { email, code } = verificationSchema.parse(request.body);
  const user = await User.findOne({ email }).select('+emailVerificationCodeHash');
  if (!user) throw new AppError(400, 'Invalid verification code. Please try again.');
  if (user.emailVerified) {
    response.json({ success: true, message: 'Account verified successfully', data: { emailVerified: true } });
    return;
  }
  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt <= new Date() || !user.emailVerificationCodeHash) {
    if (user.emailVerificationCodeHash) {
      await User.updateOne(
        { _id: user._id, emailVerified: false, emailVerificationCodeHash: user.emailVerificationCodeHash },
        { $unset: { emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1 }, $set: { emailVerificationAttempts: 0 } }
      );
    }
    throw new AppError(410, 'This verification code has expired. Please request a new code.');
  }
  if (user.emailVerificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    throw new AppError(429, 'Too many incorrect codes. Please request a new code.');
  }
  const expected = Buffer.from(user.emailVerificationCodeHash, 'hex');
  const supplied = hashVerificationCode(code);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    const update = await User.findOneAndUpdate(
      {
        _id: user._id,
        emailVerified: false,
        emailVerificationCodeHash: user.emailVerificationCodeHash,
        emailVerificationExpiresAt: { $gt: new Date() },
        emailVerificationAttempts: { $lt: MAX_VERIFICATION_ATTEMPTS }
      },
      { $inc: { emailVerificationAttempts: 1 } },
      { new: true }
    );
    if (update && update.emailVerificationAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      await User.updateOne(
        { _id: user._id, emailVerificationCodeHash: user.emailVerificationCodeHash },
        { $unset: { emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1 } }
      );
    }
    throw new AppError(400, 'Invalid verification code. Please try again.');
  }

  const verified = await User.updateOne(
    {
      _id: user._id,
      emailVerified: false,
      emailVerificationCodeHash: user.emailVerificationCodeHash,
      emailVerificationExpiresAt: { $gt: new Date() },
      emailVerificationAttempts: { $lt: MAX_VERIFICATION_ATTEMPTS }
    },
    {
      $set: { emailVerified: true, emailVerificationAttempts: 0 },
      $unset: { emailVerificationCodeHash: 1, emailVerificationExpiresAt: 1, emailVerificationSentAt: 1 }
    }
  );
  if (verified.matchedCount !== 1) {
    const current = await User.findById(user._id);
    if (!current?.emailVerified) throw new AppError(400, 'Invalid verification code. Please try again.');
  }
  response.json({ success: true, message: 'Account verified successfully', data: { emailVerified: true } });
}

export async function resendVerification(request: Request, response: Response): Promise<void> {
  const { email } = z.object({
    email: z.string().trim().email().transform((value) => value.toLowerCase())
  }).parse(request.body);
  const user = await User.findOne({ email, emailVerified: false }).select('+emailVerificationCodeHash');
  if (!user) {
    response.json({ success: true, message: 'If this account needs verification, a new code will be sent.', data: null });
    return;
  }
  if (user.emailVerificationSentAt) {
    const remainingMs = user.emailVerificationSentAt.getTime() + VERIFICATION_RESEND_COOLDOWN_MS - Date.now();
    if (remainingMs > 0) {
      throw new AppError(429, `Please wait ${Math.ceil(remainingMs / 1000)} seconds before requesting another code.`);
    }
  }
  const delivery = await sendVerificationCode(user, new Date(), true);
  response.json({
    success: true,
    message: delivery === 'development-console'
      ? 'No email was sent. The development verification code is in the API terminal.'
      : 'A new verification code has been sent.',
    data: { expiresInSeconds: VERIFICATION_EXPIRY_MS / 1000, cooldownSeconds: VERIFICATION_RESEND_COOLDOWN_MS / 1000, delivery }
  });
}

export async function login(request: Request, response: Response): Promise<void> {
  const input = loginSchema.parse(request.body);
  const user = await User.findOne({ email: input.email, isActive: true }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new AppError(401, 'Incorrect email or password.');
  }
  if (!user.emailVerified) throw new AppError(403, 'Please verify your account before logging in.');
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
  if (!user.emailVerified) {
    await session.deleteOne();
    throw new AppError(403, 'Please verify your account before logging in.');
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
  const user = await User.findOne({ email });
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
import { Schema, model } from 'mongoose';

export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['PATIENT', 'DOCTOR', 'ADMIN'], required: true },
  emailVerified: { type: Boolean, default: true },
  emailVerificationCodeHash: { type: String, select: false },
  emailVerificationExpiresAt: Date,
  emailVerificationSentAt: Date,
  emailVerificationAttempts: { type: Number, default: 0 },
  isApproved: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  consentToShare: { type: Boolean, default: false },
  resetTokenHash: { type: String, select: false },
  resetTokenExpiresAt: Date
}, { timestamps: true, versionKey: false });

export const User = model('User', userSchema);
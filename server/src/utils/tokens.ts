import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';
export type TokenUser = { id: string; email: string; role: Role };

export function signAccessToken(user: TokenUser): string {
  return jwt.sign(user, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] });
}

export function signRefreshToken(user: TokenUser, sessionId: string): string {
  return jwt.sign({ ...user, sessionId }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string): TokenUser {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenUser;
}

export function verifyRefreshToken(token: string): TokenUser & { sessionId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenUser & { sessionId: string };
}
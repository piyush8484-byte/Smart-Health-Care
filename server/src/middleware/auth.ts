import { NextFunction, Request, Response } from 'express';
import { UserRole } from '../models/User';
import { verifyAccessToken } from '../utils/tokens';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: UserRole };
    }
  }
}

export function authenticate(request: Request, response: Response, next: NextFunction): void {
  const header = request.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    response.status(401).json({ success: false, message: 'Authentication required', data: null });
    return;
  }
  try {
    request.user = verifyAccessToken(token);
    next();
  } catch {
    response.status(401).json({ success: false, message: 'Invalid or expired access token', data: null });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.user || !roles.includes(request.user.role)) {
      response.status(403).json({ success: false, message: 'Access denied.', data: null });
      return;
    }
    next();
  };
}
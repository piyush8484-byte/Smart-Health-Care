import { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/errors';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    response.status(413).json({ success: false, message: 'Report file must be 10 MB or smaller', data: null });
    return;
  }
  if (error?.name === 'ZodError') {
    response.status(400).json({ success: false, message: 'Validation failed', data: error.flatten() });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ success: false, message: error.message, data: null });
    return;
  }
  if (error?.name === 'ValidationError') {
    response.status(400).json({ success: false, message: 'Validation failed', data: error.message });
    return;
  }
  if (error?.code === 11000) {
    const duplicateEmail = error?.keyPattern?.email || error?.keyValue?.email;
    response.status(409).json({
      success: false,
      message: duplicateEmail
        ? 'An account with this email already exists. Sign in or reset your password.'
        : 'A record with that value already exists',
      data: null
    });
    return;
  }
  console.error(error);
  response.status(500).json({ success: false, message: 'Internal server error', data: null });
};
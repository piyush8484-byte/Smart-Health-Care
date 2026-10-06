import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({ success: false, message: 'Validation failed', data: result.error.flatten() });
      return;
    }
    request.body = result.data;
    next();
  };
}
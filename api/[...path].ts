import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { app } from '../server/src/app';
import { connectDatabase } from '../server/src/db';

let connectionPromise: Promise<void> | undefined;

function ensureDatabaseConnection(): Promise<void> {
  if (mongoose.connection.readyState === 1) return Promise.resolve();

  connectionPromise ??= connectDatabase().finally(() => {
    connectionPromise = undefined;
  });
  return connectionPromise;
}

export default async function handler(request: Request, response: Response): Promise<void> {
  try {
    await ensureDatabaseConnection();
  } catch (error) {
    console.error('Unable to connect to MongoDB for the Vercel API request:', error);
    response.status(503).json({
      success: false,
      message: 'The API database is temporarily unavailable.',
      data: null
    });
    return;
  }

  app(request, response);
}

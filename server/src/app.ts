import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import apiRouter from './routes/api';
import authRouter from './routes/auth';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }

    callback(null, env.allowedOrigins.includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (_request, response) => {
  response.json({ success: true, message: 'Smart Healthcare API is healthy', data: { status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', timestamp: new Date().toISOString() } });
});
app.use('/api/v1/auth', authRouter);
app.use('/api/v1', apiRouter);
app.use((_request, response) => {
  response.status(404).json({ success: false, message: 'API route not found', data: null });
});
app.use(errorHandler);
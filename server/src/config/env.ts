import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: process.env.ENV_FILE || '../.env' });
dotenv.config();

export const parseOriginList = (value?: string): string[] => [...new Set(
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
)];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/smart-healthcare'),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32).default('local-development-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(32).default('local-development-refresh-secret-change-me'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().length(32).default('0123456789abcdef0123456789abcdef'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Smart Healthcare <no-reply@example.test>'),
  UPLOAD_DIR: z.string().default('uploads'),
  DEMO_PASSWORD: z.string().min(10).default('DemoPass123!')
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production') {
    const unsafe = values.JWT_ACCESS_SECRET === 'local-development-access-secret-change-me'
      || values.JWT_REFRESH_SECRET === 'local-development-refresh-secret-change-me'
      || values.ENCRYPTION_KEY === '0123456789abcdef0123456789abcdef'
      || values.JWT_ACCESS_SECRET.includes('replace-with')
      || values.JWT_REFRESH_SECRET.includes('replace-with');

    if (unsafe) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production requires unique JWT and encryption secrets' });
    }

    const allowedOrigins = parseOriginList(values.CLIENT_ORIGIN).concat(parseOriginList(values.ALLOWED_ORIGINS));
    const hasLocalhostOrigin = allowedOrigins.some((origin) => /https?:\/\/(localhost|127\.0\.0\.1)/i.test(origin));
    if (hasLocalhostOrigin) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production origins must not include localhost or loopback endpoints' });
    }
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}

const allowedOrigins = [...new Set([
  ...parseOriginList(parsed.data.CLIENT_ORIGIN),
  ...parseOriginList(parsed.data.ALLOWED_ORIGINS)
])];

export const env = { ...parsed.data, allowedOrigins };
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
  EMAIL_VERIFICATION_SECRET: z.string().min(32).default('local-development-email-verification-secret'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().length(32).default('0123456789abcdef0123456789abcdef'),
  SMTP_HOST: z.string().trim().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Smart Healthcare <no-reply@example.test>'),
  UPLOAD_DIR: z.string().default('uploads'),
  DEMO_PASSWORD: z.string().min(10).default('DemoPass123!'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  ADMIN_NAME: z.string().trim().min(2).max(120).optional()
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production') {
    const unsafe = values.JWT_ACCESS_SECRET === 'local-development-access-secret-change-me'
      || values.JWT_REFRESH_SECRET === 'local-development-refresh-secret-change-me'
      || values.EMAIL_VERIFICATION_SECRET === 'local-development-email-verification-secret'
      || values.ENCRYPTION_KEY === '0123456789abcdef0123456789abcdef'
      || values.ENCRYPTION_KEY.includes('replace-with')
      || values.JWT_ACCESS_SECRET.includes('replace-with')
      || values.JWT_REFRESH_SECRET.includes('replace-with')
      || values.EMAIL_VERIFICATION_SECRET.includes('replace-with');

    if (unsafe) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production requires unique JWT and encryption secrets' });
    }

    let databaseHost = '';
    try {
      databaseHost = new URL(values.MONGODB_URI).hostname.toLowerCase();
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production requires a valid MONGODB_URI' });
    }
    if (['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production MONGODB_URI must use a reachable database host' });
    }

    const allowedOrigins = parseOriginList(values.CLIENT_ORIGIN).concat(parseOriginList(values.ALLOWED_ORIGINS));
    const hasLocalhostOrigin = allowedOrigins.some((origin) => /https?:\/\/(localhost|127\.0\.0\.1)/i.test(origin));
    if (hasLocalhostOrigin) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production origins must not include localhost or loopback endpoints' });
    }

    if (!values.SMTP_HOST || /^(localhost|127\.0\.0\.1)$/i.test(values.SMTP_HOST)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production requires a reachable SMTP_HOST for account verification email' });
    }
    if (/example\./i.test(values.SMTP_HOST) || /example\./i.test(values.EMAIL_FROM)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Production SMTP host and sender must be replaced with real provider values' });
    }
    if (Boolean(values.SMTP_USER) !== Boolean(values.SMTP_PASSWORD)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP_USER and SMTP_PASSWORD must both be configured or both be omitted' });
    }
    if (values.JWT_ACCESS_SECRET === values.JWT_REFRESH_SECRET
      || values.JWT_ACCESS_SECRET === values.EMAIL_VERIFICATION_SECRET
      || values.JWT_REFRESH_SECRET === values.EMAIL_VERIFICATION_SECRET) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'JWT and email-verification secrets must be different values' });
    }
  }
});

export function parseEnvironment(values: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(values);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }

  const allowedOrigins = [...new Set([
    ...parseOriginList(parsed.data.CLIENT_ORIGIN),
    ...parseOriginList(parsed.data.ALLOWED_ORIGINS)
  ])];

  return { ...parsed.data, allowedOrigins };
}

export const env = parseEnvironment(process.env);
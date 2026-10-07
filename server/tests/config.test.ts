import { parseEnvironment, parseOriginList } from '../src/config/env';

describe('environment parsing', () => {
  it('trims and deduplicates comma-separated origins', () => {
    expect(parseOriginList('https://app.example.com, https://admin.example.com,https://app.example.com')).toEqual([
      'https://app.example.com',
      'https://admin.example.com'
    ]);
  });

  it('accepts a fully configured production environment', () => {
    expect(() => parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://db.smarthealth.test/smart-healthcare',
      CLIENT_ORIGIN: 'https://app.smarthealth.test',
      JWT_ACCESS_SECRET: 'access-secret-value-that-is-at-least-32',
      JWT_REFRESH_SECRET: 'refresh-secret-value-that-is-at-least-32',
      EMAIL_VERIFICATION_SECRET: 'verification-secret-value-at-least-32',
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      SMTP_HOST: 'smtp.mail-provider.test',
      EMAIL_FROM: 'no-reply@smarthealth.test'
    })).not.toThrow();
  });

  it.each([
    ['local SMTP', { SMTP_HOST: 'localhost' }],
    ['example provider values', { SMTP_HOST: 'smtp.example.net' }],
    ['example secrets', { JWT_ACCESS_SECRET: 'replace-with-a-strong-random-secret-at-least-32-characters' }],
    ['shared auth secrets', { JWT_REFRESH_SECRET: 'access-secret-value-that-is-at-least-32' }],
    ['local origins', { CLIENT_ORIGIN: 'http://localhost:5173' }],
    ['local database', { MONGODB_URI: 'mongodb://127.0.0.1:27017/smart-healthcare' }],
    ['incomplete SMTP authentication', { SMTP_USER: 'mailer' }]
  ])('rejects production configuration with %s', (_issue, overrides) => {
    expect(() => parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://db.smarthealth.test/smart-healthcare',
      CLIENT_ORIGIN: 'https://app.smarthealth.test',
      JWT_ACCESS_SECRET: 'access-secret-value-that-is-at-least-32',
      JWT_REFRESH_SECRET: 'refresh-secret-value-that-is-at-least-32',
      EMAIL_VERIFICATION_SECRET: 'verification-secret-value-at-least-32',
      ENCRYPTION_KEY: '12345678901234567890123456789012',
      SMTP_HOST: 'smtp.mail-provider.test',
      EMAIL_FROM: 'no-reply@smarthealth.test',
      ...overrides
    })).toThrow('Invalid environment configuration');
  });
});

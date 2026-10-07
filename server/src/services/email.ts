import nodemailer from 'nodemailer';
import { env } from '../config/env';

export type EmailDelivery = 'smtp' | 'development-console';

export async function sendEmail(to: string, subject: string, text: string): Promise<EmailDelivery> {
  if (env.NODE_ENV === 'test') return 'smtp';
  if (!env.SMTP_HOST) {
    if (env.NODE_ENV === 'production') throw new Error('SMTP_HOST is not configured');
    console.info(`[development email provider] To: ${to}\nSubject: ${subject}\n${text}`);
    return 'development-console';
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {})
  });
  try {
    await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, text });
    return 'smtp';
  } catch (error) {
    if (env.NODE_ENV !== 'development') throw error;
    console.warn('[development email provider] SMTP delivery failed; the email will be displayed only in this development server terminal.');
    console.info(`[development email provider] To: ${to}\nSubject: ${subject}\n${text}`);
    return 'development-console';
  }
}
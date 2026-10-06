import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {})
});

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (env.NODE_ENV === 'test') return;
  try {
    await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, text });
  } catch (error) {
    console.warn('Email delivery failed; in-app notification remains available.', error);
  }
}
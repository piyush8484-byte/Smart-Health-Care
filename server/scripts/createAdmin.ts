import bcrypt from 'bcryptjs';
import { connectDatabase } from '../src/db';
import { env } from '../src/config/env';
import { User } from '../src/models/User';

async function createAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in the server environment before creating an administrator.');
  }

  await connectDatabase();
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    throw new Error('An account with ADMIN_EMAIL already exists. Use a different email or manage the existing account.');
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await User.create({
    name: env.ADMIN_NAME || 'Platform Administrator',
    email,
    passwordHash,
    role: 'ADMIN',
    emailVerified: true,
    isApproved: true,
    isActive: true
  });
  console.log(`Administrator account created for ${email}.`);
}

createAdmin()
  .catch((error: unknown) => {
    console.error('Administrator provisioning failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await User.db?.close();
  });

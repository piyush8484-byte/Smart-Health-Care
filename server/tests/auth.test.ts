import request from 'supertest';
import { app } from '../src/app';
import { DoctorProfile, PatientProfile } from '../src/models/Clinical';
import { RefreshSession } from '../src/models/RefreshSession';
import { User } from '../src/models/User';
import { sendEmail } from '../src/services/email';
import { signAccessToken } from '../src/utils/tokens';

jest.mock('../src/models/User', () => ({
  User: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn()
  }
}));
jest.mock('../src/models/Clinical', () => ({
  DoctorProfile: { create: jest.fn(), deleteOne: jest.fn() },
  PatientProfile: { create: jest.fn(), deleteOne: jest.fn() }
}));
jest.mock('../src/models/RefreshSession', () => ({ RefreshSession: { create: jest.fn() } }));
jest.mock('../src/services/email', () => ({ sendEmail: jest.fn() }));

type StoredUser = {
  _id: string;
  id: string;
  name: string;
  email: string;
  role: 'PATIENT' | 'DOCTOR';
  isApproved: boolean;
  isActive: boolean;
  emailVerified: boolean;
  emailVerificationCodeHash?: string;
  emailVerificationExpiresAt?: Date;
  emailVerificationSentAt?: Date;
  emailVerificationAttempts: number;
  passwordHash: string;
  save: jest.Mock;
};

describe('authentication account lifecycle', () => {
  let storedUsers: StoredUser[];
  let nextId: number;

  beforeEach(() => {
    storedUsers = [];
    nextId = 1;
    jest.clearAllMocks();

    (User.create as jest.Mock).mockImplementation(async (input: Omit<StoredUser, '_id' | 'id' | 'save'>) => {
      const id = `65a00000000000000000000${nextId++}`;
      const user = { ...input, _id: id, id, isActive: true, save: jest.fn().mockResolvedValue(undefined) } as StoredUser;
      storedUsers.push(user);
      return user;
    });
    (User.findOne as jest.Mock).mockImplementation((query: { email: string; isActive?: boolean; emailVerified?: boolean }) => {
      const user = storedUsers.find((candidate) =>
        candidate.email === query.email
        && (query.isActive === undefined || candidate.isActive === query.isActive)
        && (query.emailVerified === undefined || candidate.emailVerified === query.emailVerified)
      );
      const queryResult = Promise.resolve(user);
      return {
        select: jest.fn().mockResolvedValue(user),
        then: queryResult.then.bind(queryResult)
      };
    });
    (User.findOneAndUpdate as jest.Mock).mockImplementation(async (
      query: {
        _id: string;
        emailVerificationCodeHash?: string;
        emailVerificationAttempts?: { $lt: number };
        $or?: Array<{ emailVerificationSentAt?: { $lte?: Date } }>;
      },
      update: { $inc?: { emailVerificationAttempts?: number }; $set?: Partial<StoredUser> }
    ) => {
      const user = storedUsers.find((candidate) =>
        candidate._id === query._id
        && (query.emailVerificationCodeHash === undefined || candidate.emailVerificationCodeHash === query.emailVerificationCodeHash)
      );
      if (query.$or) {
        const cooldownBefore = query.$or.find((condition) => condition.emailVerificationSentAt?.$lte)?.emailVerificationSentAt?.$lte;
        if (!user || (user.emailVerificationSentAt && cooldownBefore && user.emailVerificationSentAt > cooldownBefore)) return null;
        Object.assign(user, update.$set);
        return user;
      }
      if (
        !user
        || !user.emailVerificationExpiresAt
        || user.emailVerificationExpiresAt <= new Date()
        || user.emailVerificationAttempts >= query.emailVerificationAttempts!.$lt
      ) return null;
      if (user && update.$inc?.emailVerificationAttempts) user.emailVerificationAttempts += update.$inc.emailVerificationAttempts;
      return user;
    });
    (User.updateOne as jest.Mock).mockImplementation(async (
      query: { _id: string; emailVerificationCodeHash?: string },
      update: { $set?: Partial<StoredUser>; $unset?: Record<string, number> }
    ) => {
      const user = storedUsers.find((candidate) =>
        candidate._id === query._id
        && (query.emailVerificationCodeHash === undefined || candidate.emailVerificationCodeHash === query.emailVerificationCodeHash)
      );
      if (!user) return { matchedCount: 0 };
      Object.assign(user, update.$set);
      for (const key of Object.keys(update.$unset ?? {})) delete user[key as keyof StoredUser];
      return { matchedCount: 1 };
    });
    (User.findById as jest.Mock).mockImplementation(async (id: string) =>
      storedUsers.find((candidate) => candidate._id === id)
    );
    (RefreshSession.create as jest.Mock).mockImplementation(async () => ({
      _id: `65b00000000000000000000${nextId++}`,
      save: jest.fn().mockResolvedValue(undefined)
    }));
    (sendEmail as jest.Mock).mockResolvedValue('smtp');
  });

  it.each([
    ['PATIENT', {}],
    ['DOCTOR', { specialization: 'Cardiology', licenseNumber: 'MED-12345' }]
  ] as const)('verifies and signs in a %s account with the registered credentials', async (role, professionalDetails) => {
    const password = 'SecureHealth123!';
    const registration = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: '  Alex Morgan  ',
        email: '  Alex.Morgan@Example.com ',
        password,
        confirmPassword: password,
        role,
        ...professionalDetails
      });

    expect(registration.status).toBe(201);
    expect(registration.body.data).toMatchObject({
      email: 'alex.morgan@example.com',
      verificationRequired: true,
      expiresInSeconds: 600,
      cooldownSeconds: 60
    });
    expect(registration.body.data).not.toHaveProperty('accessToken');
    expect(storedUsers[0].emailVerified).toBe(false);
    expect(role === 'PATIENT' ? PatientProfile.create : DoctorProfile.create).toHaveBeenCalledTimes(1);

    const blockedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '  ALEX.MORGAN@EXAMPLE.COM ', password });
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.message).toMatch(/verify your account/i);

    const emailBody = (sendEmail as jest.Mock).mock.calls[0][2] as string;
    const code = emailBody.match(/\b\d{6}\b/)?.[0];
    expect(code).toBeDefined();
    expect(emailBody).toContain('expires in 10 minutes');
    expect(storedUsers[0].emailVerificationCodeHash).not.toBe(code);

    const verified = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: '  ALEX.MORGAN@EXAMPLE.COM ', code });
    expect(verified.status).toBe(200);
    expect(verified.body.data.emailVerified).toBe(true);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alex.morgan@example.com', password: 'WrongPassword123!' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.message).toBe('Incorrect email or password.');

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '  ALEX.MORGAN@EXAMPLE.COM ', password });

    expect(login.status).toBe(200);
    expect(login.body.success).toBe(true);
    expect(login.body.data.user).toMatchObject({
      email: 'alex.morgan@example.com',
      role,
      isApproved: role === 'PATIENT'
    });
    expect(login.body.data.accessToken).toEqual(expect.any(String));
  });

  it('rejects a wrong verification code and expires an old code', async () => {
    const password = 'SecureHealth123!';
    await request(app).post('/api/v1/auth/register').send({
      name: 'Alex Morgan', email: 'alex@example.com', password, confirmPassword: password, role: 'PATIENT'
    });
    const emailBody = (sendEmail as jest.Mock).mock.calls[0][2] as string;
    const code = emailBody.match(/\b\d{6}\b/)?.[0]!;
    const wrongCodeValue = code === '000000' ? '000001' : '000000';
    const wrongCode = await request(app).post('/api/v1/auth/verify-email').send({ email: 'alex@example.com', code: wrongCodeValue });
    expect(wrongCode.status).toBe(400);
    expect(wrongCode.body.message).toBe('Invalid verification code. Please try again.');

    storedUsers[0].emailVerificationExpiresAt = new Date(Date.now() - 1000);
    const expired = await request(app).post('/api/v1/auth/verify-email').send({ email: 'alex@example.com', code });
    expect(expired.status).toBe(410);
    expect(expired.body.message).toBe('This verification code has expired. Please request a new code.');
  });

  it('validates password confirmation and does not create the account', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      name: 'Alex Morgan',
      email: 'alex@example.com',
      password: 'SecureHealth123!',
      confirmPassword: 'DifferentHealth123!',
      role: 'PATIENT'
    });
    expect(response.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid email at registration', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      name: 'Alex Morgan',
      email: 'not-an-email',
      password: 'SecureHealth123!',
      confirmPassword: 'SecureHealth123!',
      role: 'PATIENT'
    });
    expect(response.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('resends a code after cooldown and rate-limits immediate resend attempts', async () => {
    const password = 'SecureHealth123!';
    await request(app).post('/api/v1/auth/register').send({
      name: 'Alex Morgan', email: 'alex@example.com', password, confirmPassword: password, role: 'PATIENT'
    });
    storedUsers[0].emailVerificationSentAt = new Date(Date.now() - 61_000);

    const resent = await request(app).post('/api/v1/auth/resend-verification').send({ email: 'ALEX@example.com' });
    expect(resent.status).toBe(200);
    expect(resent.body.data).toMatchObject({ cooldownSeconds: 60, delivery: 'smtp' });
    expect(sendEmail).toHaveBeenCalledTimes(2);

    const tooSoon = await request(app).post('/api/v1/auth/resend-verification').send({ email: 'alex@example.com' });
    expect(tooSoon.status).toBe(429);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('allows only one resend when concurrent requests race for the cooldown', async () => {
    const password = 'SecureHealth123!';
    await request(app).post('/api/v1/auth/register').send({
      name: 'Alex Morgan', email: 'alex@example.com', password, confirmPassword: password, role: 'PATIENT'
    });
    storedUsers[0].emailVerificationSentAt = new Date(Date.now() - 61_000);

    const responses = await Promise.all([
      request(app).post('/api/v1/auth/resend-verification').send({ email: 'alex@example.com' }),
      request(app).post('/api/v1/auth/resend-verification').send({ email: 'alex@example.com' })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 429]);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('removes a new account and reports an email-delivery failure', async () => {
    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error('SMTP unavailable'));
    const password = 'SecureHealth123!';
    const response = await request(app).post('/api/v1/auth/register').send({
      name: 'Alex Morgan', email: 'alex@example.com', password, confirmPassword: password, role: 'PATIENT'
    });

    expect(response.status).toBe(503);
    expect(response.body.message).toMatch(/could not send the verification email/i);
    expect(User.deleteOne).toHaveBeenCalledTimes(1);
    expect(PatientProfile.deleteOne).toHaveBeenCalledTimes(1);
  });

  it('denies a patient account access to administrator APIs', async () => {
    const token = signAccessToken({ id: '65a000000000000000000001', email: 'patient@example.com', role: 'PATIENT' });
    const response = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Access denied.');
  });
});

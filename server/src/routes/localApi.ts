import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env';
import { createId, readFileStore, updateFileStore, type LocalState, type LocalUser } from '../data/fileStore';
import { authenticate, requireRole } from '../middleware/auth';
import { assessRisk } from '../services/risk';
import { decryptText, encryptText } from '../utils/crypto';
import { AppError } from '../utils/errors';

const router = Router();
const access = (...roles: Array<'PATIENT' | 'DOCTOR' | 'ADMIN'>) => [authenticate, requireRole(...roles)];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) {
      callback(new AppError(400, 'Only PDF, JPEG, and PNG report files are accepted'));
      return;
    }
    callback(null, true);
  }
});

function send(response: Response, message: string, data: unknown, status = 200): void {
  response.status(status).json({ success: true, message, data });
}

function page(request: Request) {
  const currentPage = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  return { currentPage, limit, start: (currentPage - 1) * limit };
}

function pageResult<T>(items: T[], request: Request) {
  const { currentPage, limit, start } = page(request);
  return { items: items.slice(start, start + limit), page: currentPage, limit, total: items.length, pages: Math.ceil(items.length / limit) };
}

function publicUser(user: LocalUser | undefined) {
  return user ? { _id: user._id, name: user.name, email: user.email, role: user.role, isApproved: user.isApproved, isActive: user.isActive, createdAt: user.createdAt } : null;
}

function audit(store: LocalState, request: Request, action: string, resourceType: string, resourceId?: string, patientId?: string): void {
  store.auditLogs.unshift({ _id: createId(), actorId: request.user?.id, actorRole: request.user?.role, action, resourceType, resourceId, patientId, occurredAt: new Date().toISOString() });
}

async function patientIdFor(request: Request): Promise<string> {
  if (request.user?.role === 'PATIENT') return request.user.id;
  const patientId = String(request.params.patientId || request.query.patientId || request.body.patientId || '');
  const allowed = await readFileStore((store) => {
    if (!store.users.some((user) => user._id === patientId && user.role === 'PATIENT')) return false;
    if (request.user?.role === 'ADMIN') return true;
    const patient = store.users.find((user) => user._id === patientId);
    const hasAppointment = store.appointments.some((appointment) => appointment.patientId === patientId && appointment.doctorId === request.user?.id && ['PENDING', 'CONFIRMED', 'COMPLETED'].includes(appointment.status));
    return Boolean(patient?.consentToShare || hasAppointment);
  });
  if (!allowed) throw new AppError(403, 'Patient consent or an active care relationship is required');
  return patientId;
}

function appointmentView(appointment: Record<string, any>, store: LocalState) {
  return {
    ...appointment,
    patientId: publicUser(store.users.find((user) => user._id === appointment.patientId)),
    doctorId: publicUser(store.users.find((user) => user._id === appointment.doctorId)),
    consultationNotes: appointment.consultationNotesEncrypted ? decryptText(appointment.consultationNotesEncrypted) : undefined
  };
}

router.get('/users/me', authenticate, async (request, response) => {
  const user = await readFileStore((store) => store.users.find((item) => item._id === request.user?.id));
  if (!user) throw new AppError(404, 'User not found');
  send(response, 'Current user', { ...publicUser(user), consentToShare: user.consentToShare });
});

router.get('/users', ...access('ADMIN'), async (request, response) => {
  const users = await readFileStore((store) => store.users
    .filter((user) => !request.query.role || user.role === String(request.query.role).toUpperCase())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((user) => ({ ...publicUser(user), specialization: user.specialization, licenseNumber: user.licenseNumber })));
  send(response, 'Users', pageResult(users, request));
});

router.patch('/users/:id', ...access('ADMIN'), async (request, response) => {
  const updates = z.object({ isActive: z.boolean().optional(), isApproved: z.boolean().optional() }).strict().parse(request.body);
  const user = await updateFileStore((store) => {
    const target = store.users.find((item) => item._id === request.params.id);
    if (!target) return undefined;
    Object.assign(target, updates);
    if (target.role === 'DOCTOR' && updates.isApproved) {
      const profile = store.doctorProfiles.find((item) => item.userId === target._id);
      if (profile) profile.approvedAt = new Date().toISOString();
    }
    return publicUser(target);
  });
  if (!user) throw new AppError(404, 'User not found');
  send(response, 'User updated', user);
});

router.get('/admin/export', ...access('ADMIN'), async (_request, response) => {
  const data = await readFileStore((store) => ({
    exportedAt: new Date().toISOString(), users: store.users.map(publicUser), patientProfiles: store.patientProfiles,
    appointments: store.appointments, records: store.records, prescriptions: store.prescriptions,
    vitals: store.vitals, alerts: store.alerts, auditLogs: store.auditLogs
  }));
  send(response, 'Administrative data export', data);
});

router.get('/patients/me', ...access('PATIENT'), async (request, response) => {
  const profile = await readFileStore((store) => store.patientProfiles.find((item) => item.userId === request.user?.id));
  send(response, 'Patient profile', profile || { userId: request.user!.id, allergies: [], chronicConditions: [] });
});

router.patch('/patients/me', ...access('PATIENT'), async (request, response) => {
  const input = z.object({
    dateOfBirth: z.coerce.date().optional(), phone: z.string().max(30).optional(), bloodGroup: z.string().max(5).optional(),
    allergies: z.array(z.string().max(100)).max(50).optional(), chronicConditions: z.array(z.string().max(100)).max(50).optional(),
    emergencyContact: z.object({ name: z.string().max(120), relationship: z.string().max(60), phone: z.string().max(30) }).optional(),
    address: z.string().max(300).optional(), consentToShare: z.boolean().optional()
  }).strict().parse(request.body);
  const profile = await updateFileStore((store) => {
    const target = store.patientProfiles.find((item) => item.userId === request.user!.id) || { userId: request.user!.id };
    const { consentToShare, ...fields } = input;
    Object.assign(target, fields);
    if (!store.patientProfiles.some((item) => item.userId === request.user!.id)) store.patientProfiles.push(target);
    if (consentToShare !== undefined) {
      const user = store.users.find((item) => item._id === request.user!.id);
      if (user) user.consentToShare = consentToShare;
    }
    return target;
  });
  send(response, 'Patient profile updated', profile);
});

router.get('/patients/:patientId/consent', ...access('DOCTOR', 'ADMIN'), async (request, response) => {
  const user = await readFileStore((store) => store.users.find((item) => item._id === request.params.patientId && item.role === 'PATIENT'));
  if (!user) throw new AppError(404, 'Patient not found');
  if (request.user!.role === 'DOCTOR') await patientIdFor(request);
  send(response, 'Record sharing consent', { consentToShare: user.consentToShare });
});

router.get('/patients/:patientId', ...access('DOCTOR', 'ADMIN'), async (request, response) => {
  const patientId = await patientIdFor(request);
  const [profile, user] = await Promise.all([
    readFileStore((store) => store.patientProfiles.find((item) => item.userId === patientId)),
    readFileStore((store) => store.users.find((item) => item._id === patientId))
  ]);
  send(response, 'Patient profile', { ...profile, userId: publicUser(user) });
});

router.get('/doctors', authenticate, async (request, response) => {
  const doctors = await readFileStore((store) => store.doctorProfiles
    .filter((profile) => store.users.some((user) => user._id === profile.userId && user.role === 'DOCTOR' && user.isApproved && user.isActive))
    .map((profile) => ({ ...profile, userId: publicUser(store.users.find((user) => user._id === profile.userId)) })));
  send(response, 'Doctors', pageResult(doctors, request));
});

router.patch('/doctors/me', ...access('DOCTOR'), async (request, response) => {
  const input = z.object({ specialization: z.string().min(2).max(100).optional(), organization: z.string().max(160).optional(), availability: z.array(z.object({ day: z.string().max(12), startTime: z.string().max(5), endTime: z.string().max(5) })).max(50).optional() }).strict().parse(request.body);
  const profile = await updateFileStore((store) => {
    const target = store.doctorProfiles.find((item) => item.userId === request.user!.id);
    if (target) Object.assign(target, input);
    return target;
  });
  send(response, 'Doctor profile updated', profile);
});

router.get('/appointments', authenticate, async (request, response) => {
  const appointments = await readFileStore((store) => store.appointments
    .filter((item) => request.user!.role === 'ADMIN' || (request.user!.role === 'PATIENT' ? item.patientId === request.user!.id : item.doctorId === request.user!.id))
    .filter((item) => !request.query.status || item.status === String(request.query.status).toUpperCase())
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .map((item) => appointmentView(item, store)));
  send(response, 'Appointments', pageResult(appointments, request));
});

router.post('/appointments', ...access('PATIENT'), async (request, response) => {
  const input = z.object({ doctorId: z.string().min(1), startsAt: z.coerce.date(), durationMinutes: z.number().int().min(10).max(240).default(30), reason: z.string().max(500).optional() }).parse(request.body);
  const appointment = await updateFileStore((store) => {
    const doctor = store.users.find((user) => user._id === input.doctorId && user.role === 'DOCTOR' && user.isActive && user.isApproved);
    if (!doctor) throw new AppError(404, 'Approved doctor not found');
    if (input.startsAt <= new Date()) throw new AppError(400, 'Appointment must be scheduled in the future');
    const created = { _id: createId(), patientId: request.user!.id, doctorId: doctor._id, startsAt: input.startsAt.toISOString(), durationMinutes: input.durationMinutes, reason: input.reason || '', status: 'PENDING', createdAt: new Date().toISOString() };
    store.appointments.push(created);
    store.notifications.push({ _id: createId(), userId: doctor._id, type: 'APPOINTMENT', title: 'Appointment request', message: 'A patient requested an appointment.', createdAt: new Date().toISOString() });
    audit(store, request, 'CREATE', 'Appointment', created._id, request.user!.id);
    return appointmentView(created, store);
  });
  send(response, 'Appointment requested', appointment, 201);
});

router.patch('/appointments/:id', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const updates = z.object({ startsAt: z.coerce.date().optional(), status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(), consultationLink: z.string().url().optional(), consultationNotes: z.string().max(5000).optional(), followUpAt: z.coerce.date().optional() }).strict().parse(request.body);
  const appointment = await updateFileStore((store) => {
    const target = store.appointments.find((item) => item._id === request.params.id);
    if (!target) return undefined;
    const patientOwner = target.patientId === request.user!.id;
    const doctorOwner = target.doctorId === request.user!.id;
    if (request.user!.role !== 'ADMIN' && !patientOwner && !doctorOwner) throw new AppError(403, 'You cannot update this appointment');
    if (patientOwner && updates.status && updates.status !== 'CANCELLED') throw new AppError(403, 'Patients may only cancel appointments');
    if (updates.consultationNotes && request.user!.role === 'PATIENT') throw new AppError(403, 'Only clinicians can add consultation notes');
    const { consultationNotes, ...fields } = updates;
    if (consultationNotes) target.consultationNotesEncrypted = encryptText(consultationNotes);
    Object.assign(target, fields);
    audit(store, request, 'UPDATE', 'Appointment', target._id, target.patientId);
    return appointmentView(target, store);
  });
  if (!appointment) throw new AppError(404, 'Appointment not found');
  send(response, 'Appointment updated', appointment);
});

router.get('/records', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const patientId = await patientIdFor(request);
  const records = await readFileStore((store) => store.records.filter((record) => record.patientId === patientId).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)));
  await updateFileStore((store) => audit(store, request, 'READ', 'HealthRecord', undefined, patientId));
  send(response, 'Health records', pageResult(records, request));
});

router.post('/records', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const input = z.object({ title: z.string().trim().min(1).max(160), category: z.enum(['LAB_REPORT', 'IMAGING', 'VISIT_NOTE', 'OTHER']).default('OTHER'), recordedAt: z.coerce.date().optional(), notes: z.string().max(10000).optional(), patientId: z.string().optional() }).parse(request.body);
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : await patientIdFor(request);
  const record = await updateFileStore((store) => {
    const created = { _id: createId(), patientId, createdBy: request.user!.id, title: input.title, category: input.category, recordedAt: (input.recordedAt || new Date()).toISOString(), notes: input.notes, createdAt: new Date().toISOString() };
    store.records.push(created);
    audit(store, request, 'CREATE', 'HealthRecord', created._id, patientId);
    return created;
  });
  send(response, 'Health record added', record, 201);
});

router.post('/records/upload', ...access('PATIENT', 'DOCTOR', 'ADMIN'), upload.single('file'), async (request, response) => {
  const file = (request as Request & { file?: Express.Multer.File }).file;
  if (!file) throw new AppError(400, 'A PDF or image report is required');
  const mimeType = file.mimetype as 'application/pdf' | 'image/jpeg' | 'image/png';
  const signatures: Record<string, (bytes: Buffer) => boolean> = {
    'application/pdf': (bytes) => bytes.subarray(0, 5).toString() === '%PDF-',
    'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': (bytes) => bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  };
  if (!signatures[mimeType]?.(file.buffer)) throw new AppError(400, 'The uploaded file content does not match its supported type');
  const input = z.object({ title: z.string().trim().min(1).max(160), category: z.enum(['LAB_REPORT', 'IMAGING', 'VISIT_NOTE', 'OTHER']).default('OTHER'), notes: z.string().max(10000).optional(), patientId: z.string().optional() }).parse(request.body);
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : await patientIdFor(request);
  const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[mimeType];
  const fileKey = `${randomUUID()}${extension}`;
  const directory = path.resolve(process.cwd(), env.UPLOAD_DIR);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, fileKey);
  await writeFile(filePath, file.buffer, { mode: 0o600 });
  try {
    const record = await updateFileStore((store) => {
      const created = { _id: createId(), patientId, createdBy: request.user!.id, title: input.title, category: input.category, notes: input.notes, recordedAt: new Date().toISOString(), fileKey, fileName: path.basename(file.originalname.replace(/\\/g, '/')).slice(0, 255), mimeType, fileUrl: `/api/records/${createId()}/file`, createdAt: new Date().toISOString() };
      created.fileUrl = `/api/records/${created._id}/file`;
      store.records.push(created);
      audit(store, request, 'UPLOAD', 'HealthRecord', created._id, patientId);
      return created;
    });
    send(response, 'Report uploaded', record, 201);
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
});

router.get('/records/:id/file', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const record = await readFileStore((store) => store.records.find((item) => item._id === request.params.id));
  if (!record?.fileKey) throw new AppError(404, 'Report file not found');
  if (request.user!.role !== 'PATIENT' || record.patientId !== request.user!.id) await patientIdFor({ ...request, params: { patientId: record.patientId } } as Request);
  await updateFileStore((store) => audit(store, request, 'DOWNLOAD', 'HealthRecord', record._id, record.patientId));
  response.type(record.mimeType || 'application/octet-stream').download(path.resolve(process.cwd(), env.UPLOAD_DIR, path.basename(record.fileKey)), record.fileName || 'report');
});

router.get('/prescriptions', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : await patientIdFor(request);
  const items = await readFileStore((store) => store.prescriptions.filter((item) => item.patientId === patientId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  send(response, 'Prescriptions', pageResult(items, request));
});

router.post('/prescriptions', ...access('DOCTOR', 'ADMIN'), async (request, response) => {
  const input = z.object({ patientId: z.string().min(1), medication: z.string().min(1).max(160), dosage: z.string().min(1).max(120), instructions: z.string().max(1000).optional(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional() }).parse(request.body);
  if (request.user!.role === 'DOCTOR') await patientIdFor(request);
  const prescription = await updateFileStore((store) => {
    const created = { _id: createId(), ...input, startsAt: input.startsAt?.toISOString(), endsAt: input.endsAt?.toISOString(), doctorId: request.user!.id, createdAt: new Date().toISOString() };
    store.prescriptions.push(created);
    audit(store, request, 'CREATE', 'Prescription', created._id, input.patientId);
    return created;
  });
  send(response, 'Prescription created', prescription, 201);
});

router.get('/vitals', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const patientId = await patientIdFor(request);
  const items = await readFileStore((store) => store.vitals.filter((item) => item.patientId === patientId).sort((left, right) => right.measuredAt.localeCompare(left.measuredAt)));
  send(response, 'Vital readings', pageResult(items, request));
});

router.post(['/vitals', '/vitals/ingest'], ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const input = z.object({
    deviceId: z.string().max(100).optional(), heartRate: z.number().min(20).max(250).optional(), spo2: z.number().min(50).max(100).optional(),
    systolic: z.number().min(50).max(300).optional(), diastolic: z.number().min(30).max(200).optional(),
    temperatureC: z.number().min(25).max(45).optional(), glucoseMgDl: z.number().min(20).max(800).optional(), measuredAt: z.coerce.date().optional()
  }).refine((value) => Object.keys(value).some((key) => key !== 'deviceId' && key !== 'measuredAt' && value[key as keyof typeof value] !== undefined), 'At least one vital measurement is required').parse(request.body);
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : await patientIdFor(request);
  const risk = assessRisk(input);
  const vital = await updateFileStore((store) => {
    const created = { _id: createId(), ...input, patientId, measuredAt: (input.measuredAt || new Date()).toISOString(), createdAt: new Date().toISOString() };
    store.vitals.push(created);
    if (risk.level !== 'LOW') {
      const alert = { _id: createId(), patientId, vitalId: created._id, level: risk.level, reasons: risk.reasons, recommendation: risk.recommendations.join(' '), createdAt: new Date().toISOString() };
      store.alerts.push(alert);
      store.notifications.push({ _id: createId(), userId: patientId, type: 'HEALTH_ALERT', title: `${risk.level} health reading`, message: risk.reasons.join(' '), createdAt: new Date().toISOString() });
    }
    audit(store, request, 'CREATE', 'Vital', created._id, patientId);
    return created;
  });
  send(response, 'Vital reading received', { vital, risk }, 201);
});

router.get('/alerts', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const patientIds = request.user!.role === 'PATIENT' ? [request.user!.id] : await readFileStore((store) => store.appointments.filter((appointment) => appointment.doctorId === request.user!.id).map((appointment) => appointment.patientId));
  const alerts = await readFileStore((store) => store.alerts.filter((alert) => request.user!.role === 'ADMIN' || patientIds.includes(alert.patientId)).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  send(response, 'Health alerts', alerts);
});

router.patch('/alerts/:id/acknowledge', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const alert = await updateFileStore((store) => {
    const item = store.alerts.find((entry) => entry._id === request.params.id);
    if (!item) return undefined;
    if (request.user!.role === 'PATIENT' && item.patientId !== request.user!.id) throw new AppError(403, 'You cannot update this alert');
    item.acknowledgedAt = new Date().toISOString();
    return item;
  });
  if (!alert) throw new AppError(404, 'Alert not found');
  send(response, 'Alert acknowledged', alert);
});

router.get('/notifications', authenticate, async (request, response) => {
  const items = await readFileStore((store) => store.notifications.filter((notification) => notification.userId === request.user!.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  const result = pageResult(items, request);
  send(response, 'Notifications', { ...result, unread: items.filter((item) => !item.readAt).length });
});

router.patch('/notifications/:id/read', authenticate, async (request, response) => {
  const notification = await updateFileStore((store) => {
    const item = store.notifications.find((entry) => entry._id === request.params.id && entry.userId === request.user!.id);
    if (item) item.readAt = new Date().toISOString();
    return item;
  });
  if (!notification) throw new AppError(404, 'Notification not found');
  send(response, 'Notification marked as read', notification);
});

router.get('/analytics/risk', ...access('PATIENT', 'DOCTOR', 'ADMIN'), async (request, response) => {
  const patientId = await patientIdFor(request);
  const latest = await readFileStore((store) => store.vitals.filter((item) => item.patientId === patientId).sort((left, right) => right.measuredAt.localeCompare(left.measuredAt))[0]);
  send(response, 'Explainable health risk summary', { assessment: latest ? assessRisk(latest) : null, latestVitals: latest || null, disclaimer: 'Decision support, not a diagnosis.' });
});

router.get('/analytics/dashboard', authenticate, async (request, response) => {
  const summary = await readFileStore((store) => {
    const user = request.user!;
    if (user.role === 'ADMIN') return { stats: { users: store.users.length, appointments: store.appointments.length, criticalAlerts: store.alerts.filter((alert) => alert.level === 'HIGH' && !alert.acknowledgedAt).length, auditEvents: store.auditLogs.length } };
    if (user.role === 'DOCTOR') return { appointments: store.appointments.filter((item) => item.doctorId === user.id), criticalAlerts: store.alerts.filter((item) => item.level === 'HIGH' && !item.acknowledgedAt) };
    const appointments = store.appointments.filter((item) => item.patientId === user.id).sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    const latestVital = store.vitals.filter((item) => item.patientId === user.id).sort((left, right) => right.measuredAt.localeCompare(left.measuredAt))[0];
    return {
      appointments, latestVital: latestVital || null, risk: latestVital ? assessRisk(latestVital) : null,
      recentRecords: store.records.filter((item) => item.patientId === user.id).slice(-5),
      activeAlerts: store.alerts.filter((item) => item.patientId === user.id && !item.acknowledgedAt)
    };
  });
  send(response, 'Dashboard', summary);
});

router.get('/audit-logs', ...access('ADMIN'), async (request, response) => {
  const items = await readFileStore((store) => store.auditLogs);
  send(response, 'Audit log', pageResult(items, request));
});

export default router;
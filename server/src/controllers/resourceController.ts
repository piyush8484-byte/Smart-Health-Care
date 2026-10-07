import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  Alert, Appointment, AuditLog, DoctorProfile, HealthRecord, Notification,
  PatientProfile, Prescription, Vital
} from '../models/Clinical';
import { User } from '../models/User';
import { recordAudit } from '../services/audit';
import { sendEmail } from '../services/email';
import { env } from '../config/env';
import { assessRisk } from '../services/risk';
import { decryptText, encryptText } from '../utils/crypto';
import { AppError } from '../utils/errors';

function responseData(response: Response, message: string, data: unknown, status = 200): void {
  response.status(status).json({ success: true, message, data });
}

function pageParams(request: Request) {
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

async function resolvePatientAccess(request: Request, patientId: string): Promise<void> {
  const actor = request.user;
  if (!actor) throw new AppError(401, 'Authentication required');
  if (actor.role === 'ADMIN' || (actor.role === 'PATIENT' && actor.id === patientId)) return;
  if (actor.role === 'DOCTOR') {
    const profile = await User.findById(patientId).select('consentToShare');
    const hasRelationship = await Appointment.exists({ patientId, doctorId: actor.id, status: { $in: ['PENDING', 'CONFIRMED', 'COMPLETED'] } });
    if (profile?.consentToShare || hasRelationship) return;
  }
  throw new AppError(403, 'Patient consent or an active care relationship is required');
}

async function resolvePatientId(request: Request): Promise<string> {
  if (request.user?.role === 'PATIENT') return request.user.id;
  const candidate = String(request.params.patientId || request.query.patientId || request.body.patientId || '');
  if (!Types.ObjectId.isValid(candidate)) throw new AppError(400, 'A valid patientId is required');
  await resolvePatientAccess(request, candidate);
  return candidate;
}

export async function listDoctors(request: Request, response: Response): Promise<void> {
  const { page, limit, skip } = pageParams(request);
  const approvedDoctors = await User.find({ role: 'DOCTOR', isApproved: true, isActive: true }).distinct('_id');
  const filter: Record<string, unknown> = { userId: { $in: approvedDoctors } };
  if (request.query.specialization) filter.specialization = new RegExp(String(request.query.specialization), 'i');
  const [profiles, total] = await Promise.all([
    DoctorProfile.find(filter).populate('userId', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    DoctorProfile.countDocuments(filter)
  ]);
  responseData(response, 'Doctors', { items: profiles, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function patientProfile(request: Request, response: Response): Promise<void> {
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : String(request.params.patientId || request.query.patientId || '');
  if (!Types.ObjectId.isValid(patientId)) throw new AppError(400, 'A valid patientId is required');
  await resolvePatientAccess(request, patientId);
  const profile = await PatientProfile.findOne({ userId: patientId }).populate('userId', 'name email').lean();
  responseData(response, 'Patient profile', profile);
}

export async function updatePatientProfile(request: Request, response: Response): Promise<void> {
  const patientId = request.user!.id;
  const input = z.object({
    dateOfBirth: z.coerce.date().optional(), phone: z.string().max(30).optional(), bloodGroup: z.string().max(5).optional(),
    allergies: z.array(z.string().max(100)).max(50).optional(), chronicConditions: z.array(z.string().max(100)).max(50).optional(),
    emergencyContact: z.object({ name: z.string().max(120), relationship: z.string().max(60), phone: z.string().max(30) }).optional(),
    address: z.string().max(300).optional(), consentToShare: z.boolean().optional()
  }).strict().parse(request.body);
  const { consentToShare, ...profileFields } = input;
  const profile = await PatientProfile.findOneAndUpdate({ userId: patientId }, { $set: profileFields }, { new: true, upsert: true, runValidators: true });
  if (consentToShare !== undefined) await User.updateOne({ _id: patientId }, { $set: { consentToShare } });
  responseData(response, 'Patient profile updated', profile);
}

export async function listAppointments(request: Request, response: Response): Promise<void> {
  const { page, limit, skip } = pageParams(request);
  const user = request.user!;
  const filter: Record<string, unknown> = user.role === 'PATIENT' ? { patientId: user.id }
    : user.role === 'DOCTOR' ? { doctorId: user.id } : {};
  if (request.query.status) filter.status = String(request.query.status).toUpperCase();
  const [items, total] = await Promise.all([
    Appointment.find(filter).populate('patientId', 'name email').populate('doctorId', 'name email').sort({ startsAt: 1 }).skip(skip).limit(limit).lean(),
    Appointment.countDocuments(filter)
  ]);
  responseData(response, 'Appointments', { items, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function createAppointment(request: Request, response: Response): Promise<void> {
  const input = z.object({ doctorId: z.string().refine(Types.ObjectId.isValid), startsAt: z.coerce.date(), durationMinutes: z.number().int().min(10).max(240).default(30), reason: z.string().max(500).optional() }).parse(request.body);
  const doctor = await User.findOne({ _id: input.doctorId, role: 'DOCTOR', isActive: true, isApproved: true });
  if (!doctor) throw new AppError(404, 'Approved doctor not found');
  if (input.startsAt <= new Date()) throw new AppError(400, 'Appointment must be scheduled in the future');
  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60000);
  const conflict = await Appointment.exists({ doctorId: doctor.id, status: { $in: ['PENDING', 'CONFIRMED'] }, startsAt: { $lt: endsAt, $gt: new Date(input.startsAt.getTime() - 240 * 60000) } });
  if (conflict) throw new AppError(409, 'The selected appointment time is unavailable');
  const { doctorId, ...appointmentInput } = input;
  const appointment = await Appointment.create({ patientId: request.user!.id, doctorId, ...appointmentInput });
  await Notification.create({ userId: doctor.id, type: 'APPOINTMENT', title: 'Appointment request', message: 'A patient requested an appointment.', metadata: { appointmentId: appointment.id } });
  responseData(response, 'Appointment requested', appointment, 201);
}

export async function updateAppointment(request: Request, response: Response): Promise<void> {
  const updates = z.object({ startsAt: z.coerce.date().optional(), status: z.enum(['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(), consultationLink: z.string().url().optional(), consultationNotes: z.string().max(5000).optional(), followUpAt: z.coerce.date().optional() }).strict().parse(request.body);
  const appointment = await Appointment.findById(request.params.id);
  if (!appointment) throw new AppError(404, 'Appointment not found');
  const actor = request.user!;
  const isPatientOwner = String(appointment.patientId) === actor.id;
  const isDoctorOwner = String(appointment.doctorId) === actor.id;
  if (actor.role !== 'ADMIN' && !isPatientOwner && !isDoctorOwner) throw new AppError(403, 'You cannot update this appointment');
  if (isPatientOwner && updates.status && !['CANCELLED'].includes(updates.status)) throw new AppError(403, 'Patients may only cancel appointments');
  if (updates.startsAt) {
    if (updates.startsAt <= new Date()) throw new AppError(400, 'Appointment must be rescheduled to a future time');
    const proposedEnd = new Date(updates.startsAt.getTime() + appointment.durationMinutes * 60000);
    const proposedStartWindow = new Date(updates.startsAt.getTime() - 240 * 60000);
    const conflict = await Appointment.exists({
      _id: { $ne: appointment._id },
      doctorId: appointment.doctorId,
      status: { $in: ['PENDING', 'CONFIRMED'] },
      startsAt: { $lt: proposedEnd, $gt: proposedStartWindow }
    });
    if (conflict) throw new AppError(409, 'The selected appointment time is unavailable');
  }
  if (updates.consultationNotes) {
    if (actor.role === 'PATIENT') throw new AppError(403, 'Only clinicians can add consultation notes');
    appointment.consultationNotesEncrypted = encryptText(updates.consultationNotes);
  }
  const { consultationNotes, ...safeUpdates } = updates;
  appointment.set(safeUpdates);
  await appointment.save();
  const appointmentData: Record<string, unknown> = appointment.toObject();
  const encryptedNotes = appointmentData.consultationNotesEncrypted as string | undefined;
  delete appointmentData.consultationNotesEncrypted;
  responseData(response, 'Appointment updated', {
    ...appointmentData,
    consultationNotes: encryptedNotes ? decryptText(encryptedNotes) : undefined
  });
}

export async function listRecords(request: Request, response: Response): Promise<void> {
  const patientId = await resolvePatientId(request);
  const { page, limit, skip } = pageParams(request);
  const filter: Record<string, unknown> = { patientId };
  if (request.query.category) filter.category = String(request.query.category).toUpperCase();
  const [items, total] = await Promise.all([HealthRecord.find(filter).sort({ recordedAt: -1 }).skip(skip).limit(limit).lean(), HealthRecord.countDocuments(filter)]);
  const records = items.map((item: Record<string, any>) => ({ ...item, notes: item.notesEncrypted ? decryptText(item.notesEncrypted) : undefined, notesEncrypted: undefined }));
  await recordAudit(request, 'READ', 'HealthRecord', undefined, patientId);
  responseData(response, 'Health records', { items: records, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function createRecord(request: Request, response: Response): Promise<void> {
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : String(request.body.patientId || '');
  if (!Types.ObjectId.isValid(patientId)) throw new AppError(400, 'A valid patientId is required');
  if (request.user!.role !== 'PATIENT') await resolvePatientAccess(request, patientId);
  const input = z.object({ title: z.string().trim().min(1).max(160), category: z.enum(['LAB_REPORT', 'IMAGING', 'VISIT_NOTE', 'OTHER']).default('OTHER'), recordedAt: z.coerce.date().optional(), notes: z.string().max(10000).optional(), fileName: z.string().max(255).optional(), mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']).optional(), fileUrl: z.string().url().optional() }).parse(request.body);
  const { notes, ...fields } = input;
  const record = await HealthRecord.create({ ...fields, patientId, createdBy: request.user!.id, notesEncrypted: notes ? encryptText(notes) : undefined });
  await recordAudit(request, 'CREATE', 'HealthRecord', record.id, patientId);
  responseData(response, 'Health record added', { ...record.toObject(), notes, notesEncrypted: undefined }, 201);
}

export async function uploadRecord(request: Request, response: Response): Promise<void> {
  const file = (request as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
  if (!file) throw new AppError(400, 'A PDF or image report is required');
  const mimeType = file.mimetype as 'application/pdf' | 'image/jpeg' | 'image/png';
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : String(request.body.patientId || '');
  if (!Types.ObjectId.isValid(patientId)) throw new AppError(400, 'A valid patientId is required');
  if (request.user!.role !== 'PATIENT') await resolvePatientAccess(request, patientId);
  const signatures: Record<string, (bytes: Buffer) => boolean> = {
    'application/pdf': (bytes) => bytes.subarray(0, 5).toString() === '%PDF-',
    'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': (bytes) => bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  };
  if (!signatures[mimeType]?.(file.buffer)) throw new AppError(400, 'The uploaded file content does not match its supported type');
  const input = z.object({
    title: z.string().trim().min(1).max(160),
    category: z.enum(['LAB_REPORT', 'IMAGING', 'VISIT_NOTE', 'OTHER']).default('OTHER'),
    notes: z.string().max(10000).optional()
  }).parse(request.body);
  const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[mimeType];
  const fileKey = `${randomUUID()}${extension}`;
  const directory = path.resolve(process.cwd(), env.UPLOAD_DIR);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, fileKey);
  await writeFile(filePath, file.buffer, { mode: 0o600 });
  try {
    const record = await HealthRecord.create({
      patientId,
      createdBy: request.user!.id,
      title: input.title,
      category: input.category,
      notesEncrypted: input.notes ? encryptText(input.notes) : undefined,
      fileName: path.basename(file.originalname.replace(/\\/g, '/')).slice(0, 255),
      mimeType,
      fileKey
    });
    record.fileUrl = `/api/v1/records/${record.id}/file`;
    await record.save();
    await recordAudit(request, 'UPLOAD', 'HealthRecord', record.id, patientId);
    responseData(response, 'Report uploaded', {
      id: record.id, title: record.title, fileName: record.fileName, mimeType: record.mimeType, fileUrl: record.fileUrl
    }, 201);
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }
}

export async function downloadRecord(request: Request, response: Response): Promise<void> {
  const record = await HealthRecord.findById(request.params.id).select('+fileKey');
  if (!record || !record.fileKey) throw new AppError(404, 'Report file not found');
  await resolvePatientAccess(request, String(record.patientId));
  await recordAudit(request, 'DOWNLOAD', 'HealthRecord', record.id, String(record.patientId));
  response.type(record.mimeType || 'application/octet-stream');
  response.download(path.resolve(process.cwd(), env.UPLOAD_DIR, path.basename(record.fileKey)), record.fileName || 'report');
}

export async function listPrescriptions(request: Request, response: Response): Promise<void> {
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : String(request.query.patientId || '');
  if (request.user!.role !== 'PATIENT') await resolvePatientAccess(request, patientId);
  const { page, limit, skip } = pageParams(request);
  const [items, total] = await Promise.all([Prescription.find({ patientId }).populate('doctorId', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Prescription.countDocuments({ patientId })]);
  await recordAudit(request, 'READ', 'Prescription', undefined, patientId);
  responseData(response, 'Prescriptions', { items, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function createPrescription(request: Request, response: Response): Promise<void> {
  const input = z.object({ patientId: z.string().refine(Types.ObjectId.isValid), appointmentId: z.string().optional(), medication: z.string().min(1).max(160), dosage: z.string().min(1).max(120), instructions: z.string().max(1000).optional(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional() }).parse(request.body);
  if (request.user!.role === 'DOCTOR') {
    await resolvePatientAccess(request, input.patientId);
  }
  const prescription = await Prescription.create({ ...input, doctorId: request.user!.id });
  await recordAudit(request, 'CREATE', 'Prescription', prescription.id, input.patientId);
  responseData(response, 'Prescription created', prescription, 201);
}

export async function listVitals(request: Request, response: Response): Promise<void> {
  const patientId = await resolvePatientId(request);
  const { page, limit, skip } = pageParams(request);
  const [items, total] = await Promise.all([Vital.find({ patientId }).sort({ measuredAt: -1 }).skip(skip).limit(limit).lean(), Vital.countDocuments({ patientId })]);
  responseData(response, 'Vital readings', { items, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function ingestVitals(request: Request, response: Response): Promise<void> {
  const patientId = request.user!.role === 'PATIENT' ? request.user!.id : String(request.body.patientId || '');
  if (!Types.ObjectId.isValid(patientId)) throw new AppError(400, 'A valid patientId is required');
  if (request.user!.role !== 'PATIENT') await resolvePatientAccess(request, patientId);
  const input = z.object({ deviceId: z.string().max(100).optional(), heartRate: z.number().min(20).max(250).optional(), spo2: z.number().min(50).max(100).optional(), systolic: z.number().min(50).max(300).optional(), diastolic: z.number().min(30).max(200).optional(), temperatureC: z.number().min(25).max(45).optional(), glucoseMgDl: z.number().min(20).max(800).optional(), measuredAt: z.coerce.date().optional() }).refine((values) => Object.keys(values).some((key) => key !== 'deviceId' && key !== 'measuredAt' && values[key as keyof typeof values] !== undefined), 'At least one vital measurement is required').parse(request.body);
  const vital = await Vital.create({ ...input, patientId });
  const assessment = assessRisk(input);
  if (assessment.level !== 'LOW') {
    const alert = await Alert.create({ patientId, vitalId: vital.id, level: assessment.level, reasons: assessment.reasons, recommendation: assessment.recommendations.join(' ') });
    await Notification.create({ userId: patientId, type: 'HEALTH_ALERT', title: `${assessment.level} health reading`, message: assessment.reasons.join(' '), metadata: { alertId: alert.id } });
    if (assessment.level === 'HIGH') {
      const patient = await User.findById(patientId).select('email');
      if (patient) await sendEmail(patient.email, 'High-priority health reading', `${assessment.reasons.join(' ')} ${assessment.recommendations[0]}`);
    }
  }
  await recordAudit(request, 'CREATE', 'Vital', vital.id, patientId);
  responseData(response, 'Vital reading received', { vital, risk: assessment }, 201);
}

export async function riskSummary(request: Request, response: Response): Promise<void> {
  const patientId = await resolvePatientId(request);
  const latest = await Vital.findOne({ patientId }).sort({ measuredAt: -1 }).lean();
  responseData(response, 'Explainable health risk summary', {
    assessment: latest ? assessRisk(latest) : null,
    latestVitals: latest,
    disclaimer: 'Decision support, not a diagnosis.'
  });
}

export async function dashboard(request: Request, response: Response): Promise<void> {
  const user = request.user!;
  if (user.role === 'PATIENT') {
    const [appointments, latestVital, records, alerts] = await Promise.all([
      Appointment.find({ patientId: user.id, status: { $in: ['PENDING', 'CONFIRMED'] }, startsAt: { $gte: new Date() } }).populate('doctorId', 'name').sort({ startsAt: 1 }).limit(5).lean(),
      Vital.findOne({ patientId: user.id }).sort({ measuredAt: -1 }).lean(),
      HealthRecord.find({ patientId: user.id }).sort({ recordedAt: -1 }).limit(5).lean(),
      Alert.find({ patientId: user.id, acknowledgedAt: { $exists: false } }).sort({ createdAt: -1 }).limit(10).lean()
    ]);
    responseData(response, 'Patient dashboard', { appointments, latestVital, risk: latestVital ? assessRisk(latestVital) : null, recentRecords: records, activeAlerts: alerts });
    return;
  }
  if (user.role === 'DOCTOR') {
    const [appointments, alerts] = await Promise.all([
      Appointment.find({ doctorId: user.id, startsAt: { $gte: new Date() }, status: { $in: ['PENDING', 'CONFIRMED'] } }).populate('patientId', 'name email').sort({ startsAt: 1 }).limit(50).lean(),
      Alert.find({ level: 'HIGH', acknowledgedAt: { $exists: false } }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    const patientIds = new Set(appointments.map((appointment: any) => String(appointment.patientId?._id || appointment.patientId)));
    const criticalAlerts = alerts.filter((alert: any) => patientIds.has(String(alert.patientId)));
    responseData(response, 'Doctor dashboard', { appointments, criticalAlerts });
    return;
  }
  const [users, appointments, alerts, auditEvents] = await Promise.all([
    User.countDocuments(), Appointment.countDocuments(), Alert.countDocuments({ level: 'HIGH', acknowledgedAt: { $exists: false } }), AuditLog.countDocuments()
  ]);
  responseData(response, 'Administrator dashboard', { stats: { users, appointments, criticalAlerts: alerts, auditEvents } });
}

export async function listNotifications(request: Request, response: Response): Promise<void> {
  const { page, limit, skip } = pageParams(request);
  const filter = { userId: request.user!.id };
  const [items, total, unread] = await Promise.all([Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Notification.countDocuments(filter), Notification.countDocuments({ ...filter, readAt: { $exists: false } })]);
  responseData(response, 'Notifications', { items, page, limit, total, unread, pages: Math.ceil(total / limit) });
}

export async function markNotificationRead(request: Request, response: Response): Promise<void> {
  const notification = await Notification.findOneAndUpdate({ _id: request.params.id, userId: request.user!.id }, { $set: { readAt: new Date() } }, { new: true });
  if (!notification) throw new AppError(404, 'Notification not found');
  responseData(response, 'Notification marked as read', notification);
}

export async function listAlerts(request: Request, response: Response): Promise<void> {
  const user = request.user!;
  const filter: Record<string, unknown> = user.role === 'PATIENT' ? { patientId: user.id } : {};
  if (user.role === 'DOCTOR') {
    const [appointments, consentedPatients] = await Promise.all([
      Appointment.find({ doctorId: user.id, status: { $in: ['PENDING', 'CONFIRMED', 'COMPLETED'] } }).distinct('patientId'),
      User.find({ role: 'PATIENT', consentToShare: true }).distinct('_id')
    ]);
    filter.patientId = { $in: [...new Set([...appointments.map(String), ...consentedPatients.map(String)])] };
  }
  const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  responseData(response, 'Health alerts', alerts);
}

export async function acknowledgeAlert(request: Request, response: Response): Promise<void> {
  const alert = await Alert.findById(request.params.id);
  if (!alert) throw new AppError(404, 'Alert not found');
  if (request.user!.role === 'PATIENT' && String(alert.patientId) !== request.user!.id) throw new AppError(403, 'You cannot update this alert');
  if (request.user!.role === 'DOCTOR') await resolvePatientAccess(request, String(alert.patientId));
  alert.acknowledgedAt = new Date();
  await alert.save();
  responseData(response, 'Alert acknowledged', alert);
}

export async function listAuditLogs(request: Request, response: Response): Promise<void> {
  const { page, limit, skip } = pageParams(request);
  const [items, total] = await Promise.all([AuditLog.find().sort({ occurredAt: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments()]);
  responseData(response, 'Audit log', { items, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function listUsers(request: Request, response: Response): Promise<void> {
  const { page, limit, skip } = pageParams(request);
  const filter = request.query.role ? { role: String(request.query.role).toUpperCase() } : {};
  const [users, total] = await Promise.all([User.find(filter).select('-passwordHash -resetTokenHash').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
  const doctorIds = users.filter((user) => user.role === 'DOCTOR').map((user) => user._id);
  const doctorProfiles = doctorIds.length
    ? await DoctorProfile.find({ userId: { $in: doctorIds } }).select('userId specialization licenseNumber').lean()
    : [];
  const doctorProfilesByUserId = new Map(doctorProfiles.map((profile) => [String(profile.userId), profile]));
  const items = users.map((user) => {
    const profile = doctorProfilesByUserId.get(String(user._id));
    return profile ? { ...user, specialization: profile.specialization, licenseNumber: profile.licenseNumber } : user;
  });
  responseData(response, 'Users', { items, page, limit, total, pages: Math.ceil(total / limit) });
}

export async function updateUser(request: Request, response: Response): Promise<void> {
  const updates = z.object({ isActive: z.boolean().optional(), isApproved: z.boolean().optional() }).strict().parse(request.body);
  const user = await User.findByIdAndUpdate(request.params.id, { $set: updates }, { new: true, runValidators: true }).select('-passwordHash');
  if (!user) throw new AppError(404, 'User not found');
  if (user.role === 'DOCTOR' && updates.isApproved) {
    const profile = await DoctorProfile.findOneAndUpdate({ userId: user.id }, { $set: { approvedAt: new Date() } }, { new: true });
    void profile;
  }
  responseData(response, 'User updated', user);
}

export async function updateDoctorProfile(request: Request, response: Response): Promise<void> {
  const input = z.object({ specialization: z.string().min(2).max(100).optional(), availability: z.array(z.object({ day: z.string().max(12), startTime: z.string().max(5), endTime: z.string().max(5) })).max(50).optional(), organization: z.string().max(160).optional() }).strict().parse(request.body);
  const profile = await DoctorProfile.findOneAndUpdate({ userId: request.user!.id }, { $set: input }, { new: true, runValidators: true });
  responseData(response, 'Doctor profile updated', profile);
}

export async function getConsent(request: Request, response: Response): Promise<void> {
  const patientId = String(request.params.patientId || '');
  if (!Types.ObjectId.isValid(patientId)) throw new AppError(400, 'A valid patientId is required');
  const user = await User.findOne({ _id: patientId, role: 'PATIENT' }).select('consentToShare');
  if (!user) throw new AppError(404, 'Patient not found');
  responseData(response, 'Record sharing consent', { consentToShare: user?.consentToShare ?? false });
}

export async function exportAdminData(request: Request, response: Response): Promise<void> {
  await recordAudit(request, 'EXPORT', 'ClinicalData');
  const [users, profiles, appointments, records, prescriptions, vitals, alerts, auditLogs] = await Promise.all([
    User.find().select('-passwordHash -resetTokenHash').limit(10000).lean(),
    PatientProfile.find().limit(10000).lean(),
    Appointment.find().limit(10000).lean(),
    HealthRecord.find().limit(10000).lean(),
    Prescription.find().limit(10000).lean(),
    Vital.find().limit(10000).lean(),
    Alert.find().limit(10000).lean(),
    AuditLog.find().limit(10000).lean()
  ]);
  responseData(response, 'Administrative data export (up to 10,000 items per collection)', {
    exportedAt: new Date().toISOString(), users, patientProfiles: profiles, appointments, records, prescriptions, vitals, alerts, auditLogs
  });
}
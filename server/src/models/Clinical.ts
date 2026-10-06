import { Schema, model } from 'mongoose';

const ownerField = { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true };

const patientSchema = new Schema({
  userId: { ...ownerField, unique: true },
  dateOfBirth: Date,
  phone: String,
  bloodGroup: String,
  allergies: [String],
  chronicConditions: [String],
  emergencyContact: { name: String, relationship: String, phone: String },
  address: String
}, { timestamps: true });

const doctorSchema = new Schema({
  userId: { ...ownerField, unique: true },
  specialization: { type: String, required: true },
  licenseNumber: { type: String, required: true },
  organization: String,
  availability: [{ day: String, startTime: String, endTime: String }],
  approvedAt: Date
}, { timestamps: true });

const appointmentSchema = new Schema({
  patientId: ownerField,
  doctorId: ownerField,
  startsAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, default: 30, min: 10, max: 240 },
  status: { type: String, enum: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'], default: 'PENDING' },
  reason: { type: String, maxlength: 500 },
  consultationLink: String,
  consultationNotesEncrypted: String,
  followUpAt: Date
}, { timestamps: true });

const recordSchema = new Schema({
  patientId: ownerField,
  createdBy: ownerField,
  title: { type: String, required: true, maxlength: 160 },
  category: { type: String, enum: ['LAB_REPORT', 'IMAGING', 'VISIT_NOTE', 'OTHER'], default: 'OTHER' },
  recordedAt: { type: Date, default: Date.now },
  notesEncrypted: String,
  fileName: String,
  mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'] },
  fileUrl: String,
  fileKey: { type: String, select: false }
}, { timestamps: true });

const prescriptionSchema = new Schema({
  patientId: ownerField,
  doctorId: ownerField,
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
  medication: { type: String, required: true },
  dosage: { type: String, required: true },
  instructions: String,
  startsAt: Date,
  endsAt: Date
}, { timestamps: true });

const vitalSchema = new Schema({
  patientId: ownerField,
  deviceId: String,
  heartRate: { type: Number, min: 20, max: 250 },
  spo2: { type: Number, min: 50, max: 100 },
  systolic: { type: Number, min: 50, max: 300 },
  diastolic: { type: Number, min: 30, max: 200 },
  temperatureC: { type: Number, min: 25, max: 45 },
  glucoseMgDl: { type: Number, min: 20, max: 800 },
  measuredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

const notificationSchema = new Schema({
  userId: ownerField,
  type: { type: String, enum: ['APPOINTMENT', 'HEALTH_ALERT', 'SYSTEM'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  readAt: Date,
  metadata: Schema.Types.Mixed
}, { timestamps: true });

const alertSchema = new Schema({
  patientId: ownerField,
  vitalId: { type: Schema.Types.ObjectId, ref: 'Vital' },
  level: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], required: true },
  reasons: [String],
  recommendation: String,
  acknowledgedAt: Date
}, { timestamps: true });

const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  actorRole: String,
  action: { type: String, required: true },
  resourceType: { type: String, required: true },
  resourceId: String,
  patientId: String,
  ipAddress: String,
  occurredAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

export const PatientProfile = model('PatientProfile', patientSchema);
export const DoctorProfile = model('DoctorProfile', doctorSchema);
export const Appointment = model('Appointment', appointmentSchema);
export const HealthRecord = model('HealthRecord', recordSchema);
export const Prescription = model('Prescription', prescriptionSchema);
export const Vital = model('Vital', vitalSchema);
export const Notification = model('Notification', notificationSchema);
export const Alert = model('Alert', alertSchema);
export const AuditLog = model('AuditLog', auditLogSchema);
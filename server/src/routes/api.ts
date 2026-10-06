import { Router } from 'express';
import { currentUser } from '../controllers/authController';
import {
  acknowledgeAlert, createAppointment, createPrescription, createRecord, dashboard, getConsent, ingestVitals,
  listAlerts, listAppointments, listAuditLogs, listDoctors, listNotifications, listPrescriptions, listRecords,
  exportAdminData, listUsers, listVitals, markNotificationRead, patientProfile, riskSummary, updateAppointment, updateDoctorProfile,
  updatePatientProfile, updateUser, uploadRecord, downloadRecord
} from '../controllers/resourceController';
import { authenticate, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import multer from 'multer';
import { AppError } from '../utils/errors';

const router = Router();
const roles = (...allowed: UserRole[]) => [authenticate, requireRole(...allowed)];
const reportUpload = multer({
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

router.get('/users/me', authenticate, asyncHandler(currentUser));
router.get('/users', ...roles('ADMIN'), asyncHandler(listUsers));
router.patch('/users/:id', ...roles('ADMIN'), asyncHandler(updateUser));
router.get('/admin/export', ...roles('ADMIN'), asyncHandler(exportAdminData));
router.get('/patients/me', ...roles('PATIENT'), asyncHandler(patientProfile));
router.patch('/patients/me', ...roles('PATIENT'), asyncHandler(updatePatientProfile));
router.get('/patients/:patientId', ...roles('DOCTOR', 'ADMIN'), asyncHandler(patientProfile));
router.get('/patients/:patientId/consent', ...roles('DOCTOR', 'ADMIN'), asyncHandler(getConsent));
router.get('/doctors', authenticate, asyncHandler(listDoctors));
router.patch('/doctors/me', ...roles('DOCTOR'), asyncHandler(updateDoctorProfile));
router.get('/appointments', authenticate, asyncHandler(listAppointments));
router.post('/appointments', ...roles('PATIENT'), asyncHandler(createAppointment));
router.patch('/appointments/:id', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(updateAppointment));
router.get('/records', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(listRecords));
router.post('/records', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(createRecord));
router.post('/records/upload', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), reportUpload.single('file'), asyncHandler(uploadRecord));
router.get('/records/:id/file', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(downloadRecord));
router.get('/prescriptions', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(listPrescriptions));
router.post('/prescriptions', ...roles('DOCTOR', 'ADMIN'), asyncHandler(createPrescription));
router.get('/vitals', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(listVitals));
router.post('/vitals', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(ingestVitals));
router.post('/vitals/ingest', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(ingestVitals));
router.get('/alerts', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(listAlerts));
router.patch('/alerts/:id/acknowledge', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(acknowledgeAlert));
router.get('/notifications', authenticate, asyncHandler(listNotifications));
router.patch('/notifications/:id/read', authenticate, asyncHandler(markNotificationRead));
router.get('/analytics/risk', ...roles('PATIENT', 'DOCTOR', 'ADMIN'), asyncHandler(riskSummary));
router.get('/analytics/dashboard', authenticate, asyncHandler(dashboard));
router.get('/audit-logs', ...roles('ADMIN'), asyncHandler(listAuditLogs));

export default router;
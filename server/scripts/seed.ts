import bcrypt from 'bcryptjs';
import { connectDatabase } from '../src/db';
import { Appointment, DoctorProfile, PatientProfile, Vital } from '../src/models/Clinical';
import { User } from '../src/models/User';
import { env } from '../src/config/env';

async function seed(): Promise<void> {
  await connectDatabase();
  const passwordHash = await bcrypt.hash(env.DEMO_PASSWORD, 12);
  const demoUsers = [
    { name: 'Demo Patient', email: 'patient@demo.com', role: 'PATIENT', emailVerified: true, isApproved: true },
    { name: 'Demo Doctor', email: 'doctor@demo.com', role: 'DOCTOR', emailVerified: true, isApproved: true },
    { name: 'Demo Administrator', email: 'admin@demo.com', role: 'ADMIN', emailVerified: true, isApproved: true }
  ] as const;
  const users = new Map<string, any>();
  for (const input of demoUsers) {
    const user = await User.findOneAndUpdate(
      { email: input.email },
      { $set: { ...input, passwordHash, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    users.set(input.role, user);
  }

  const patient = users.get('PATIENT');
  const doctor = users.get('DOCTOR');
  await PatientProfile.updateOne({ userId: patient._id }, {
    $setOnInsert: { bloodGroup: 'O+', allergies: ['Penicillin'], chronicConditions: [] }
  }, { upsert: true });
  await DoctorProfile.updateOne({ userId: doctor._id }, {
    $set: { specialization: 'Cardiology', licenseNumber: 'DEMO-MED-001', organization: 'Smart Care Clinic', approvedAt: new Date() }
  }, { upsert: true });
  await Vital.findOneAndUpdate({ patientId: patient._id, deviceId: 'demo-watch' }, {
    $set: { heartRate: 76, spo2: 98, systolic: 122, diastolic: 80, temperatureC: 36.8, glucoseMgDl: 105, measuredAt: new Date() }
  }, { upsert: true, new: true });
  await Appointment.updateOne({ patientId: patient._id, doctorId: doctor._id, reason: 'Routine check-in' }, {
    $setOnInsert: { startsAt: new Date(Date.now() + 2 * 86400000), durationMinutes: 30, status: 'CONFIRMED' }
  }, { upsert: true });
  console.log(`Seed complete. Demo accounts use the DEMO_PASSWORD value (${env.DEMO_PASSWORD.length} characters).`);
  await User.db?.close();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error);
  await User.db?.close();
  process.exitCode = 1;
});
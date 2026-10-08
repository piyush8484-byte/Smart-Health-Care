import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type LocalRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export type LocalUser = {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: LocalRole;
  isApproved: boolean;
  isActive: boolean;
  consentToShare: boolean;
  createdAt: string;
  specialization?: string;
  licenseNumber?: string;
};

export type LocalState = {
  users: LocalUser[];
  refreshSessions: Array<{ id: string; userId: string; tokenHash: string; expiresAt: string }>;
  patientProfiles: Array<Record<string, any> & { userId: string }>;
  doctorProfiles: Array<Record<string, any> & { userId: string }>;
  appointments: Array<Record<string, any>>;
  records: Array<Record<string, any>>;
  prescriptions: Array<Record<string, any>>;
  vitals: Array<Record<string, any>>;
  alerts: Array<Record<string, any>>;
  notifications: Array<Record<string, any>>;
  auditLogs: Array<Record<string, any>>;
};

const emptyState = (): LocalState => ({
  users: [], refreshSessions: [], patientProfiles: [], doctorProfiles: [], appointments: [],
  records: [], prescriptions: [], vitals: [], alerts: [], notifications: [], auditLogs: []
});

let state: LocalState | undefined;
let storePath = '';
let writeQueue: Promise<void> = Promise.resolve();

export function createId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

export async function initializeFileStore(filePath: string): Promise<void> {
  storePath = path.resolve(filePath);
  await mkdir(path.dirname(storePath), { recursive: true });
  try {
    state = JSON.parse(await readFile(storePath, 'utf8')) as LocalState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state = emptyState();
    await persist(state);
  }
  for (const [key, value] of Object.entries(emptyState())) {
    if (!Array.isArray(state[key as keyof LocalState])) (state as any)[key] = value;
  }
}

async function ready(): Promise<LocalState> {
  if (!state) await initializeFileStore(path.resolve(process.cwd(), 'data/healthcare.json'));
  return state!;
}

async function persist(snapshot: LocalState): Promise<void> {
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, storePath);
}

export async function readFileStore<T>(select: (current: LocalState) => T): Promise<T> {
  return select(await ready());
}

export async function updateFileStore<T>(mutate: (current: LocalState) => T): Promise<T> {
  const current = await ready();
  const result = mutate(current);
  const snapshot = JSON.parse(JSON.stringify(current)) as LocalState;
  const nextWrite = writeQueue.then(() => persist(snapshot));
  writeQueue = nextWrite.catch(() => undefined);
  await nextWrite;
  return result;
}
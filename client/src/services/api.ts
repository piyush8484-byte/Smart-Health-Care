export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';
export type User = { id: string; name: string; email: string; role: Role; isApproved: boolean };
export type Session = { user: User; accessToken: string; refreshToken: string };
export type RegistrationResult = { email: string; verificationRequired: true; expiresInSeconds: number; cooldownSeconds: number; delivery: 'smtp' | 'development-console' };
type Envelope<T> = { success: boolean; message: string; data: T };

const SESSION_KEY = 'smart-healthcare.session';
const configuredApiBase = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const API_ORIGIN = configuredApiBase?.replace(/\/api(?:\/v1)?$/, '') || '';
const API_BASE = `${API_ORIGIN}/api`;

export function apiFileUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    return (await fetch(`${API_ORIGIN}/api/health`)).ok;
  } catch {
    return false;
  }
}

export async function downloadPrivateFile(path: string, filename: string): Promise<void> {
  let session = readSession();
  if (!session?.accessToken) throw new Error('Sign in again to download this report.');
  let response = await fetch(apiFileUrl(path), { headers: { Authorization: `Bearer ${session.accessToken}` } });
  if (response.status === 401 && session.refreshToken) {
    session = await refreshAccessToken(session.refreshToken);
    if (session) response = await fetch(apiFileUrl(path), { headers: { Authorization: `Bearer ${session.accessToken}` } });
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null) as Envelope<unknown> | null;
    throw new Error(error?.message || `Download failed (${response.status})`);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as Session : null;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function writeSession(session: Session | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function refreshAccessToken(refreshToken: string): Promise<Session | null> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  if (!response.ok) return null;
  const result = await response.json() as Envelope<{ accessToken: string; refreshToken: string }>;
  const current = readSession();
  if (!current) return null;
  const next = { ...current, ...result.data };
  writeSession(next);
  return next;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const session = readSession();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('Unable to connect to the server. Please try again.');
  }
  if (response.status === 401 && retry && session?.refreshToken && !path.startsWith('/auth/')) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    if (refreshed) return apiRequest<T>(path, options, false);
    writeSession(null);
  }
  const result = await response.json().catch(() => null) as Envelope<T> | null;
  if (!response.ok || !result?.success) {
    const data = result?.data as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | null | undefined;
    const validationDetails = data?.fieldErrors
      ? Object.values(data.fieldErrors).flat().join(' ')
      : data?.formErrors?.join(' ');
    const message = result?.message || `Request failed (${response.status})`;
    throw new Error(validationDetails ? `${message}: ${validationDetails}` : message);
  }
  return result.data;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function loginRequest(email: string, password: string): Promise<Session> {
  return apiPost<Session>('/auth/login', { email, password });
}

export async function registerRequest(input: Record<string, unknown>): Promise<RegistrationResult> {
  return apiPost<RegistrationResult>('/auth/register', input);
}
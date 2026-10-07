import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, AlarmClock, ArrowDownToLine, ArrowRight, Bell, CalendarDays, Check, CheckCheck,
  ClipboardList, CloudUpload, FileHeart, HeartPulse, LayoutDashboard, LockKeyhole, LogOut,
  Menu, Moon, Plus, Search, Settings2, ShieldCheck, Sparkles, Stethoscope, Sun, Users, UserRound
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { useAuth, useTheme, useToasts } from '../app/providers';
import { apiPost, apiRequest, checkApiHealth, downloadPrivateFile, type Role } from '../services/api';

type Vital = { _id: string; measuredAt: string; heartRate?: number; spo2?: number; systolic?: number; diastolic?: number; temperatureC?: number; glucoseMgDl?: number };
type Appointment = { _id: string; startsAt: string; status: string; reason?: string; consultationLink?: string; patientId?: { _id: string; name: string } | string; doctorId?: { _id: string; name: string } | string };
type AppointmentUpdate = { status?: string; startsAt?: string; consultationLink?: string; consultationNotes?: string; followUpAt?: string };
type HealthRecord = { _id: string; title: string; category: string; recordedAt: string; fileName?: string; fileUrl?: string; notes?: string };
type PrescriptionItem = { _id: string; medication: string; dosage: string; instructions?: string; startsAt?: string; endsAt?: string; createdAt: string };
type AlertItem = { _id: string; level: string; reasons: string[]; recommendation?: string; createdAt: string; acknowledgedAt?: string };
type NotificationItem = { _id: string; title: string; message: string; type: string; createdAt: string; readAt?: string };
type DoctorItem = { userId: { _id: string; name: string }; specialization: string; organization?: string };
type Risk = { level: 'LOW' | 'MEDIUM' | 'HIGH'; score: number; reasons: string[]; recommendations: string[]; disclaimer: string };
type PageData<T> = { items?: T[]; unread?: number };
type AdminUser = { _id: string; name: string; email: string; role: Role; isApproved: boolean; isActive: boolean; specialization?: string; licenseNumber?: string; createdAt?: string };

const paths: Record<string, string> = {
  overview: 'Overview', records: 'Health records', appointments: 'Appointments', monitoring: 'Monitoring',
  insights: 'Health insights', notifications: 'Notifications', people: 'People & access', settings: 'Settings'
};

function sectionLabel(section: string, role: Role): string {
  if (section === 'people') {
    if (role === 'PATIENT') return 'Care team';
    if (role === 'DOCTOR') return 'My patients';
  }
  return paths[section] || 'Workspace';
}

function extractItems<T>(data: PageData<T> | T[] | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

function formatDate(value?: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Not scheduled' : new Intl.DateTimeFormat('en', options).format(date);
}

function dateTime(value?: string): string {
  return formatDate(value, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function Dashboard() {
  const { section = 'overview' } = useParams();
  const { session, signOut } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const { pushToast } = useToasts();
  const navigate = useNavigate();
  const user = session!.user;
  const effectiveRole = user.role;
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [consent, setConsent] = useState(false);
  const unread = notifications.filter((notification) => !notification.readAt).length;

  const refreshCore = async () => {
    setLoadError('');
    const overviewTask = apiRequest<Record<string, any>>('/analytics/dashboard').then(setSummary);
    const notificationTask = apiRequest<PageData<NotificationItem>>('/notifications?limit=30').then((data) => setNotifications(extractItems(data)));
    const tasks: Promise<unknown>[] = [overviewTask, notificationTask];
    if (user.role === 'PATIENT') {
      tasks.push(apiRequest<PageData<Appointment>>('/appointments?limit=20').then((data) => setAppointments(extractItems(data))));
      tasks.push(apiRequest<PageData<HealthRecord>>('/records?limit=20').then((data) => setRecords(extractItems(data))));
      tasks.push(apiRequest<PageData<PrescriptionItem>>('/prescriptions?limit=30').then((data) => setPrescriptions(extractItems(data))));
      tasks.push(apiRequest<PageData<Vital>>('/vitals?limit=60').then((data) => setVitals(extractItems(data))));
      tasks.push(apiRequest<AlertItem[]>('/alerts').then(setAlerts));
      tasks.push(apiRequest<PageData<DoctorItem>>('/doctors?limit=100').then((data) => setDoctors(extractItems(data))));
      tasks.push(apiRequest<{ consentToShare: boolean }>('/users/me').then((data) => setConsent(data.consentToShare)));
    } else if (user.role === 'DOCTOR') {
      tasks.push(apiRequest<PageData<Appointment>>('/appointments?limit=50').then((data) => setAppointments(extractItems(data))));
      tasks.push(apiRequest<AlertItem[]>('/alerts').then(setAlerts));
    } else {
      tasks.push(apiRequest<PageData<AdminUser>>('/users?limit=100').then((data) => setAdminUsers(extractItems(data))));
      tasks.push(apiRequest<PageData<Record<string, unknown>>>('/audit-logs?limit=30').then((data) => setSummary((current) => ({ ...current, auditItems: data.items || [] }))));
    }
    const results = await Promise.allSettled(tasks);
    const failure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failure) setLoadError(failure.reason instanceof Error ? failure.reason.message : 'Some workspace data could not be loaded.');
    setLoading(false);
  };

  useEffect(() => { void refreshCore(); }, [user.id, user.role]);
  useEffect(() => {
    const updateStatus = () => checkApiHealth().then(setApiOnline);
    void updateStatus();
    const timer = window.setInterval(updateStatus, 20000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (user.role !== 'PATIENT' || section !== 'monitoring') return;
    const poll = () => apiRequest<PageData<Vital>>('/vitals?limit=60').then((data) => setVitals(extractItems(data))).catch(() => undefined);
    const timer = window.setInterval(poll, 10000);
    return () => window.clearInterval(timer);
  }, [section, user.id, user.role]);

  const signOutAndReturn = async () => {
    try { await apiPost('/auth/logout', { refreshToken: session?.refreshToken }); } catch { /* Local sign-out remains available offline. */ }
    signOut();
    navigate('/');
  };

  const navItems = useMemo(() => {
    const common = [
      { id: 'overview', icon: LayoutDashboard },
      { id: 'appointments', icon: CalendarDays },
      { id: 'notifications', icon: Bell }
    ];
    if (effectiveRole === 'PATIENT') return [common[0], { id: 'records', icon: FileHeart }, common[1], { id: 'monitoring', icon: Activity }, { id: 'insights', icon: Sparkles }, common[2], { id: 'settings', icon: Settings2 }];
    if (effectiveRole === 'DOCTOR') return [common[0], { id: 'people', icon: Users }, common[1], { id: 'monitoring', icon: Activity }, common[2], { id: 'settings', icon: Settings2 }];
    return [common[0], { id: 'people', icon: Users }, { id: 'appointments', icon: CalendarDays }, { id: 'notifications', icon: Bell }, { id: 'settings', icon: ShieldCheck }];
  }, [effectiveRole]);

  const acknowledge = async (alertId: string) => {
    try { await apiRequest(`/alerts/${alertId}/acknowledge`, { method: 'PATCH', body: '{}' }); await refreshCore(); pushToast('Alert marked as reviewed.'); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Could not update alert.', 'error'); }
  };

  const markRead = async (notificationId: string) => {
    try { await apiRequest(`/notifications/${notificationId}/read`, { method: 'PATCH', body: '{}' }); await refreshCore(); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Could not update notification.', 'error'); }
  };

  const approveUser = async (target: AdminUser) => {
    try { await apiRequest(`/users/${target._id}`, { method: 'PATCH', body: JSON.stringify({ isApproved: true }) }); await refreshCore(); pushToast(`${target.name} is approved.`); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Could not update account.', 'error'); }
  };

  if (!paths[section]) return <Navigate to="/app/overview" replace />;

  return <div className="dashboard-shell">
    <aside className={`dashboard-sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <Link to="/" className="brand-lockup dashboard-brand"><span className="brand-mark"><HeartPulse size={19} /></span><span>smart<span className="brand-light">care</span><small>CARE WORKSPACE</small></span></Link>
      <div className="workspace-switch"><span className={`workspace-avatar ${effectiveRole.toLowerCase()}`}>{initials(user.name)}</span><span><b>{user.name}</b><small>{roleLabel(effectiveRole)}</small></span><span className="workspace-chevron"><Check size={14} /></span></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="dashboard-nav" aria-label="Workspace navigation">{navItems.map(({ id, icon: Icon }) => <NavLink key={id} to={`/app/${id}`} onClick={() => setMobileNav(false)} className={({ isActive }) => `dashboard-nav-link ${isActive ? 'active' : ''}`}><Icon size={17} /><span>{sectionLabel(id, effectiveRole)}</span>{id === 'notifications' && unread > 0 && <i className="unread-count">{unread}</i>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="support-note"><div><ShieldCheck size={16} /><b>Private by design</b></div><p>Your records are shared only through role access and consent.</p><Link to="/privacy">Privacy approach <ArrowRight size={13} /></Link></div><button className="dashboard-nav-link sidebar-signout" onClick={signOutAndReturn}><LogOut size={17} /><span>Sign out</span></button></div>
    </aside>
    {mobileNav && <button className="sidebar-scrim" aria-label="Close workspace navigation" onClick={() => setMobileNav(false)} />}
    <section className="dashboard-main">
      <header className="dashboard-topbar"><button className="icon-button dashboard-menu-toggle" onClick={() => setMobileNav((open) => !open)} aria-label="Toggle workspace navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><b>{sectionLabel(section, effectiveRole)}</b></div><div className="topbar-actions"><span className={`api-status ${apiOnline === null ? '' : apiOnline ? 'online' : 'offline'}`}><i />{apiOnline === null ? 'Checking API' : apiOnline ? 'API online' : 'API unavailable'}</span><button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button><button className="notification-top" onClick={() => navigate('/app/notifications')} aria-label={`${unread} unread notifications`}><Bell size={18} />{unread > 0 && <i />}</button><span className="top-avatar">{initials(user.name)}</span></div></header>
      <main className="dashboard-content"><div className="dashboard-heading"><div><span className="dashboard-kicker">{formatDate(new Date().toISOString(), { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</span><h1>{headingFor(section, effectiveRole, user.name)}</h1><p>{subheadingFor(section, effectiveRole)}</p></div>{section === 'overview' && effectiveRole === 'PATIENT' && <Link className="button button-primary" to="/app/appointments"><Plus size={16} /> Book an appointment</Link>}</div>
        {loadError && <div className="inline-alert alert-warning"><AlarmClock size={17} /><span>{loadError} Some sections may be incomplete.</span><button onClick={() => { setLoading(true); void refreshCore(); }}>Retry</button></div>}
        {loading ? <DashboardSkeleton /> : <>
          {section === 'overview' && <Overview role={effectiveRole} userName={user.name} summary={summary} vitals={vitals} records={records} appointments={appointments} alerts={alerts} notifications={notifications} users={adminUsers} onAcknowledge={acknowledge} onMarkRead={markRead} onApprove={approveUser} />}
          {section === 'records' && effectiveRole === 'PATIENT' && <RecordsView records={records} prescriptions={prescriptions} onUploaded={refreshCore} />}
          {section === 'appointments' && <AppointmentsView role={effectiveRole} appointments={appointments} doctors={doctors} onChanged={refreshCore} />}
          {section === 'monitoring' && (effectiveRole === 'DOCTOR' ? <DoctorPatients appointments={appointments} /> : <MonitoringView role={effectiveRole} vitals={vitals} onChanged={refreshCore} />)}
          {section === 'insights' && <InsightsView role={effectiveRole} summary={summary} vitals={vitals} alerts={alerts} onAcknowledge={acknowledge} />}
          {section === 'notifications' && <NotificationsView notifications={notifications} onMarkRead={markRead} />}
          {section === 'people' && <PeopleView role={effectiveRole} users={adminUsers} auditItems={summary.auditItems || []} appointments={appointments} alerts={alerts} onApprove={approveUser} />}
          {section === 'settings' && <SettingsView role={effectiveRole} consent={consent} onConsent={async (next) => { setConsent(next); try { await apiRequest('/patients/me', { method: 'PATCH', body: JSON.stringify({ consentToShare: next }) }); pushToast('Your sharing preference has been saved.'); } catch (error) { setConsent(!next); pushToast(error instanceof Error ? error.message : 'Could not save preference.', 'error'); } }} />}
        </>}</main>
      <footer className="dashboard-footer"><span>SMART HEALTHCARE CLOUD · {roleLabel(effectiveRole).toUpperCase()}</span><span><ShieldCheck size={13} /> Decision support, not a diagnosis.</span></footer>
    </section>
  </div>;
}

function roleLabel(role: Role): string {
  if (role === 'PATIENT') return 'Patient workspace';
  if (role === 'DOCTOR') return 'Doctor workspace';
  return 'Administrator workspace';
}
function headingFor(section: string, role: Role, name: string): string {
  if (section === 'overview') return `${role === 'PATIENT' ? 'Good to see you' : 'Good morning'}, ${name.split(' ')[0]}`;
  if (section === 'people') return role === 'PATIENT' ? 'Your care team' : role === 'DOCTOR' ? 'Your patients' : 'People & access';
  return sectionLabel(section, role);
}
function subheadingFor(section: string, role: Role): string {
  if (section === 'overview') return role === 'PATIENT' ? 'Your health, appointments and care updates in one view.' : 'Your schedule and the patients who need your attention.';
  if (section === 'monitoring') return 'Recent health readings with simple, explainable context.';
  if (section === 'records') return 'Your health history, reports and prescriptions.';
  if (section === 'people') {
    if (role === 'PATIENT') return 'Clinicians connected to your appointments and care.';
    if (role === 'DOCTOR') return 'Review patients in your care schedule and their shared information.';
    return 'Manage accounts, doctor approvals and access history.';
  }
  return `Review and manage ${sectionLabel(section, role).toLowerCase()} details.`;
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton"><div className="skeleton-stat-grid">{[1, 2, 3, 4].map((item) => <div className="skeleton-block" key={item} />)}</div><div className="skeleton-large-row"><div className="skeleton-block" /><div className="skeleton-block" /></div></div>;
}

function Overview({ role, userName, summary, vitals, records, appointments, alerts, notifications, users, onAcknowledge, onMarkRead, onApprove }: {
  role: Role; userName: string; summary: Record<string, any>; vitals: Vital[]; records: HealthRecord[]; appointments: Appointment[]; alerts: AlertItem[]; notifications: NotificationItem[]; users: AdminUser[];
  onAcknowledge: (id: string) => void; onMarkRead: (id: string) => void; onApprove: (user: AdminUser) => void;
}) {
  const currentRisk = summary.risk as Risk | undefined;
  const activeAlerts = alerts.filter((alert) => !alert.acknowledgedAt);
  if (role === 'ADMIN') return <><div className="stat-grid four"><StatCard icon={Users} label="Registered users" value={summary.stats?.users ?? users.length} detail="Across all roles" tone="blue" /><StatCard icon={CalendarDays} label="Appointments" value={summary.stats?.appointments ?? 0} detail="All-time bookings" tone="mint" /><StatCard icon={Activity} label="Critical alerts" value={summary.stats?.criticalAlerts ?? 0} detail="Awaiting review" tone="coral" /><StatCard icon={ClipboardList} label="Access events" value={summary.stats?.auditEvents ?? 0} detail="Audit trail entries" tone="gold" /></div><div className="dashboard-columns"><PeopleCard users={users} onApprove={onApprove} /><Panel title="Recent access events" icon={LockKeyhole}><AuditPreview items={summary.auditItems || []} /></Panel></div></>;
  if (role === 'DOCTOR') return <><div className="stat-grid three"><StatCard icon={CalendarDays} label="Upcoming visits" value={appointments.filter((item) => item.status === 'CONFIRMED' || item.status === 'PENDING').length} detail="Today and ahead" tone="blue" /><StatCard icon={Users} label="Patients in schedule" value={new Set(appointments.map((item) => String((item.patientId as { _id?: string })?._id || item.patientId))).size} detail="Active appointments" tone="mint" /><StatCard icon={Activity} label="Critical alerts" value={activeAlerts.filter((alert) => alert.level === 'HIGH').length} detail="Needs attention" tone="coral" /></div><div className="dashboard-columns"><AppointmentsCard appointments={appointments.slice(0, 5)} role={role} /><AlertsCard alerts={activeAlerts.slice(0, 4)} onAcknowledge={onAcknowledge} /></div></>;
  return <><div className="stat-grid four"><StatCard icon={CalendarDays} label="Upcoming appointments" value={appointments.filter((item) => ['PENDING', 'CONFIRMED'].includes(item.status)).length} detail={appointments[0] ? dateTime(appointments[0].startsAt) : 'Nothing booked yet'} tone="blue" /><StatCard icon={Activity} label="Latest heart rate" value={vitals[0]?.heartRate ? `${vitals[0].heartRate} bpm` : '—'} detail={vitals[0] ? `Updated ${formatDate(vitals[0].measuredAt)}` : 'Connect a device to begin'} tone="mint" /><StatCard icon={Sparkles} label="Risk overview" value={currentRisk?.level || '—'} detail={currentRisk?.reasons?.length ? `${currentRisk.reasons.length} reading(s) flagged` : 'No recent flags'} tone={currentRisk?.level === 'HIGH' ? 'coral' : 'gold'} /><StatCard icon={FileHeart} label="Health records" value={records.length} detail="Reports and care notes" tone="blue" /></div><div className="dashboard-columns"><VitalsCard vitals={vitals} /><AppointmentsCard appointments={appointments.slice(0, 4)} role={role} /></div><div className="dashboard-columns"><AlertsCard alerts={activeAlerts.slice(0, 3)} onAcknowledge={onAcknowledge} /><RecentRecords records={records.slice(0, 4)} /></div><div className="dashboard-welcome"><span className="welcome-icon"><HeartPulse size={21} /></span><div><b>Care, at your pace.</b><p>{userName.split(' ')[0]}, review what matters today and share only what you choose.</p></div><Link to="/app/settings">Sharing settings <ArrowRight size={14} /></Link></div><NotificationsMini notifications={notifications.slice(0, 3)} onMarkRead={onMarkRead} /></>;
}

function StatCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Users; label: string; value: string | number; detail: string; tone: string }) {
  return <article className="stat-card"><div className={`stat-icon tone-${tone}`}><Icon size={18} /></div><span className="stat-label">{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Panel({ title, icon: Icon, children, action }: { title: string; icon: typeof Users; children: ReactNode; action?: ReactNode }) {
  return <section className="dashboard-panel"><div className="panel-heading"><div><span className="panel-icon"><Icon size={16} /></span><h2>{title}</h2></div>{action}</div>{children}</section>;
}

function VitalsCard({ vitals }: { vitals: Vital[] }) {
  const chartData = vitals.slice(0, 24).reverse().map((item) => ({ ...item, time: formatDate(item.measuredAt, { hour: 'numeric', minute: '2-digit' }) }));
  return <Panel title="Vitals over time" icon={Activity} action={<Link to="/app/monitoring" className="panel-link">Full monitoring <ArrowRight size={14} /></Link>}><div className="chart-legend"><span><i className="legend-hr" />Heart rate</span><span><i className="legend-spo" />SpO₂</span><span className="chart-updated">{vitals[0] ? `Updated ${formatDate(vitals[0].measuredAt)}` : 'Awaiting readings'}</span></div>{chartData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="230"><LineChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: -22 }}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={28} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} domain={[50, 140]} /><Tooltip /><ReferenceArea y1={60} y2={100} fill="#dbf1e7" fillOpacity={0.5} /><Line type="monotone" dataKey="heartRate" name="Heart rate (bpm)" stroke="#168c70" strokeWidth={2.5} dot={false} connectNulls /><Line type="monotone" dataKey="spo2" name="SpO₂ (%)" stroke="#3676b8" strokeWidth={2} dot={false} connectNulls /></LineChart></ResponsiveContainer></div> : <EmptyState icon={Activity} title="No readings yet" text="Connect a device or enter a reading to start your timeline." />}</Panel>;
}

function AppointmentsCard({ appointments, role }: { appointments: Appointment[]; role: Role }) {
  return <Panel title={role === 'DOCTOR' ? 'Today & upcoming' : 'Next appointments'} icon={CalendarDays} action={<Link to="/app/appointments" className="panel-link">View schedule <ArrowRight size={14} /></Link>}>
    {appointments.length ? <div className="appointment-list">{appointments.map((item) => <AppointmentRow key={item._id} appointment={item} role={role} />)}</div> : <EmptyState icon={CalendarDays} title="No visits scheduled" text="Appointments will appear here when they are booked." />}
  </Panel>;
}

function AppointmentRow({ appointment, role }: { appointment: Appointment; role: Role }) {
  const other = role === 'DOCTOR' ? appointment.patientId : appointment.doctorId;
  const personName = typeof other === 'object' && other ? other.name : role === 'DOCTOR' ? 'Patient visit' : 'Care team';
  return <div className="appointment-row"><div className="appointment-date"><b>{new Date(appointment.startsAt).getDate()}</b><small>{new Date(appointment.startsAt).toLocaleString('en', { month: 'short' }).toUpperCase()}</small></div><div className="appointment-info"><b>{personName}</b><span>{dateTime(appointment.startsAt)}{appointment.reason ? ` · ${appointment.reason}` : ''}</span></div><StatusBadge value={appointment.status} /></div>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.toLowerCase()}`}>{value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>;
}

function AlertsCard({ alerts, onAcknowledge }: { alerts: AlertItem[]; onAcknowledge: (id: string) => void }) {
  return <Panel title="Health alerts" icon={Activity} action={<Link to="/app/insights" className="panel-link">See insights <ArrowRight size={14} /></Link>}>
    {alerts.length ? <div className="alert-list">{alerts.map((alert) => <div className={`health-alert alert-${alert.level.toLowerCase()}`} key={alert._id}><span className="alert-dot" /><div><div className="alert-title-row"><b>{alert.level} reading</b><small>{formatDate(alert.createdAt)}</small></div><p>{alert.reasons.join(' ')}</p>{alert.recommendation && <span className="alert-recommendation">{alert.recommendation}</span>}</div>{!alert.acknowledgedAt && <button className="icon-button alert-ack" onClick={() => onAcknowledge(alert._id)} aria-label="Acknowledge alert"><Check size={15} /></button>}</div>)}</div> : <EmptyState icon={ShieldCheck} title="You’re up to date" text="There are no unreviewed health alerts." />}
  </Panel>;
}

function RecentRecords({ records }: { records: HealthRecord[] }) {
  return <Panel title="Recent health records" icon={FileHeart} action={<Link to="/app/records" className="panel-link">All records <ArrowRight size={14} /></Link>}>
    {records.length ? <div className="record-mini-list">{records.map((record) => <div className="record-mini" key={record._id}><span className="record-mini-icon"><FileHeart size={16} /></span><span><b>{record.title}</b><small>{record.category.replace('_', ' ')} · {formatDate(record.recordedAt)}</small></span>{record.fileUrl && <ReportDownloadButton filePath={record.fileUrl} filename={record.fileName || record.title} compact />}</div>)}</div> : <EmptyState icon={FileHeart} title="No records added" text="Your reports and care notes will appear here." />}
  </Panel>;
}

function ReportDownloadButton({ filePath, filename, compact = false }: { filePath: string; filename: string; compact?: boolean }) {
  const { pushToast } = useToasts();
  const download = async () => {
    try { await downloadPrivateFile(filePath, filename); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Report download failed.', 'error'); }
  };
  return <button className={`table-download ${compact ? 'compact-download' : ''}`} onClick={() => void download()} aria-label={`Download ${filename}`} title={`Download ${filename}`}><ArrowDownToLine size={14} />{compact ? null : 'Download'}</button>;
}

function NotificationsMini({ notifications, onMarkRead }: { notifications: NotificationItem[]; onMarkRead: (id: string) => void }) {
  return <Panel title="Recent notifications" icon={Bell} action={<Link to="/app/notifications" className="panel-link">All notifications <ArrowRight size={14} /></Link>}>
    {notifications.length ? <div className="notification-list">{notifications.map((notification) => <div className={`notification-row ${notification.readAt ? '' : 'unread'}`} key={notification._id}><span className="notification-type-icon"><Bell size={15} /></span><div><b>{notification.title}</b><p>{notification.message}</p><small>{formatDate(notification.createdAt)}</small></div>{!notification.readAt && <button onClick={() => onMarkRead(notification._id)} aria-label="Mark notification as read"><Check size={15} /></button>}</div>)}</div> : <EmptyState icon={Bell} title="No notifications" text="Important updates will appear here." />}
  </Panel>;
}

function PeopleCard({ users, onApprove }: { users: AdminUser[]; onApprove: (user: AdminUser) => void }) {
  const pending = users.filter((person) => person.role === 'DOCTOR' && !person.isApproved);
  return <Panel title="Doctor credential review" icon={ShieldCheck} action={<Link to="/app/people" className="panel-link">Manage users <ArrowRight size={14} /></Link>}>
    {pending.length ? pending.slice(0, 5).map((person) => <div className="people-row" key={person._id}><span className="person-avatar">{initials(person.name)}</span><span><b>{person.name}</b><small>{person.email} · {person.specialization || 'Specialization missing'} · License {person.licenseNumber || 'not provided'}</small></span><button className="button button-small button-outline" onClick={() => onApprove(person)}>Approve</button></div>) : <EmptyState icon={CheckCheck} title="No pending approvals" text="New doctor registrations will be listed here for credential review." />}
  </Panel>;
}

function AuditPreview({ items }: { items: Record<string, any>[] }) {
  if (!items.length) return <EmptyState icon={LockKeyhole} title="No access events yet" text="Sensitive record activity appears here." />;
  return <div className="audit-list">{items.slice(0, 6).map((item) => <div className="audit-row" key={item._id}><span className="audit-dot" /><span><b>{item.action} · {item.resourceType}</b><small>{item.actorRole || 'System'} · {formatDate(item.occurredAt)}</small></span></div>)}</div>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
  return <div className="empty-state"><span><Icon size={19} /></span><b>{title}</b><p>{text}</p></div>;
}

function RecordsView({ records, prescriptions, onUploaded }: { records: HealthRecord[]; prescriptions: PrescriptionItem[]; onUploaded: () => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const { pushToast } = useToasts();
  const filtered = records.filter((record) => record.title.toLowerCase().includes(search.toLowerCase()) && (category === 'all' || record.category === category));
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!data.get('file') || (data.get('file') as File).size === 0) { pushToast('Choose a PDF, JPEG or PNG report.', 'error'); return; }
    setUploading(true);
    try { await apiRequest('/records/upload', { method: 'POST', body: data }); form.reset(); await onUploaded(); pushToast('Your report is now in your health record.'); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Upload failed.', 'error'); }
    finally { setUploading(false); }
  };
  return <div className="records-layout"><section className="dashboard-panel upload-panel"><div className="upload-heading"><span className="upload-icon"><CloudUpload size={22} /></span><div><h2>Add a health report</h2><p>Upload a PDF or image. Maximum size: 10 MB.</p></div></div><form onSubmit={upload} className="upload-form"><label className="field"><span>Report title</span><input name="title" required maxLength={160} placeholder="e.g. Blood work, March 2026" /></label><label className="field"><span>Category</span><select name="category" defaultValue="OTHER"><option value="LAB_REPORT">Lab report</option><option value="IMAGING">Imaging</option><option value="VISIT_NOTE">Visit note</option><option value="OTHER">Other</option></select></label><label className="file-drop"><input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /><span><CloudUpload size={20} /><b>Choose a file</b><small>PDF, PNG or JPEG</small></span></label><button className="button button-primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload report'} <ArrowRight size={15} /></button></form></section>
    <Panel title="Your records" icon={FileHeart} action={<span className="record-total">{records.length} total</span>}><div className="record-filters"><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records" /></label><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by record category"><option value="all">All categories</option><option value="LAB_REPORT">Lab reports</option><option value="IMAGING">Imaging</option><option value="VISIT_NOTE">Visit notes</option><option value="OTHER">Other</option></select></div>{filtered.length ? <div className="records-table-wrap"><table className="data-table"><thead><tr><th>Record</th><th>Category</th><th>Date</th><th>File</th></tr></thead><tbody>{filtered.map((record) => <tr key={record._id}><td><span className="table-record"><FileHeart size={16} /><b>{record.title}</b></span></td><td><span className="category-chip">{record.category.replace('_', ' ')}</span></td><td>{formatDate(record.recordedAt)}</td><td>{record.fileUrl ? <ReportDownloadButton filePath={record.fileUrl} filename={record.fileName || record.title} /> : '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon={FileHeart} title="No matching reports" text={records.length ? 'Try another title or category.' : 'Uploaded reports will appear in this list.'} />}</Panel>
    <Panel title="Prescriptions" icon={ClipboardList} action={<span className="record-total">{prescriptions.length} active or recent</span>}>{prescriptions.length ? <div className="prescription-list">{prescriptions.map((prescription) => <article className="prescription-row" key={prescription._id}><span className="prescription-icon"><ClipboardList size={16} /></span><div><b>{prescription.medication}</b><small>{prescription.dosage}</small>{prescription.instructions && <p>{prescription.instructions}</p>}</div><span className="prescription-date">{formatDate(prescription.createdAt)}</span></article>)}</div> : <EmptyState icon={ClipboardList} title="No prescriptions yet" text="Prescriptions from your clinician will appear here." />}</Panel>
  </div>;
}

function AppointmentsView({ role, appointments, doctors, onChanged }: { role: Role; appointments: Appointment[]; doctors: DoctorItem[]; onChanged: () => Promise<void> }) {
  const { pushToast } = useToasts();
  const [submitting, setSubmitting] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const isPatient = role === 'PATIENT';
  const requestAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = new Date(String(data.get('startsAt')));
    if (!selectedDoctor || Number.isNaN(startsAt.valueOf())) { pushToast('Choose a clinician and appointment time.', 'error'); return; }
    setSubmitting(true);
    try { await apiPost('/appointments', { doctorId: selectedDoctor, startsAt: startsAt.toISOString(), reason: data.get('reason') }); form.reset(); setSelectedDoctor(''); await onChanged(); pushToast('Your appointment request was sent.'); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Could not book appointment.', 'error'); }
    finally { setSubmitting(false); }
  };
  const changeAppointment = async (appointment: Appointment, updates: AppointmentUpdate) => {
    try {
      await apiRequest(`/appointments/${appointment._id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      await onChanged();
      pushToast(updates.startsAt ? 'Appointment rescheduled.' : updates.status ? `Appointment ${updates.status.toLowerCase()}.` : 'Consultation details saved.');
    }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Could not update appointment.', 'error'); }
  };
  return <div className="appointments-layout">{isPatient && <section className="dashboard-panel book-panel"><div className="panel-heading"><div><span className="panel-icon"><Plus size={16} /></span><h2>Request an appointment</h2></div></div><form className="book-form" onSubmit={requestAppointment}><label className="field"><span>Clinician</span><select value={selectedDoctor} onChange={(event) => setSelectedDoctor(event.target.value)} required><option value="">Choose a clinician</option>{doctors.map((doctor) => <option key={doctor.userId._id} value={doctor.userId._id}>{doctor.userId.name} · {doctor.specialization}</option>)}</select></label><label className="field"><span>Date and time</span><input type="datetime-local" name="startsAt" required min={new Date(Date.now() + 3600000).toISOString().slice(0, 16)} /></label><label className="field"><span>Reason for visit <small>(optional)</small></span><input name="reason" maxLength={500} placeholder="Routine check-in" /></label><button className="button button-primary" disabled={submitting}>{submitting ? 'Sending…' : 'Request time'} <ArrowRight size={15} /></button></form></section>}
    <Panel title={isPatient ? 'Your appointments' : role === 'DOCTOR' ? 'Patient schedule' : 'All appointments'} icon={CalendarDays} action={<span className="record-total">{appointments.length} total</span>}>{appointments.length ? <div className="appointment-full-list">{appointments.map((appointment) => <AppointmentDetail key={appointment._id} role={role} appointment={appointment} onAction={changeAppointment} />)}</div> : <EmptyState icon={CalendarDays} title="No appointments yet" text={isPatient ? 'Choose an approved clinician to request a time.' : 'New patient appointments will appear here.'} />}</Panel>
  </div>;
}

function AppointmentDetail({ role, appointment, onAction }: { role: Role; appointment: Appointment; onAction: (appointment: Appointment, updates: AppointmentUpdate) => void }) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const { pushToast } = useToasts();
  const other = role === 'DOCTOR' || role === 'ADMIN' ? appointment.patientId : appointment.doctorId;
  const name = typeof other === 'object' && other ? other.name : role === 'PATIENT' ? 'Your clinician' : 'Patient';
  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const updates: AppointmentUpdate = {};
    const notes = String(data.get('consultationNotes') || '').trim();
    const link = String(data.get('consultationLink') || '').trim();
    const followUp = String(data.get('followUpAt') || '');
    if (notes) updates.consultationNotes = notes;
    if (link) updates.consultationLink = link;
    if (followUp) updates.followUpAt = new Date(followUp).toISOString();
    if (!Object.keys(updates).length) { pushToast('Add a note, video link or follow-up time.', 'error'); return; }
    setSavingDetails(true);
    await onAction(appointment, updates);
    setSavingDetails(false);
    setDetailsOpen(false);
  };
  return <article className="appointment-detail"><div className="appointment-detail-date"><span>{new Date(appointment.startsAt).toLocaleDateString('en', { weekday: 'short' })}</span><b>{new Date(appointment.startsAt).getDate()}</b><small>{new Date(appointment.startsAt).toLocaleDateString('en', { month: 'short' })}</small></div><div className="appointment-detail-body"><div className="appointment-title-row"><h3>{name}</h3><StatusBadge value={appointment.status} /></div><p>{dateTime(appointment.startsAt)} · {appointment.reason || 'Consultation'}</p>{appointment.consultationLink && <a className="panel-link" href={appointment.consultationLink} target="_blank" rel="noreferrer">Open consultation link <ArrowRight size={13} /></a>}</div><div className="appointment-actions">{role === 'DOCTOR' && appointment.status === 'PENDING' && <button className="button button-small button-primary" onClick={() => onAction(appointment, { status: 'CONFIRMED' })}>Confirm</button>}{role === 'DOCTOR' && appointment.status === 'CONFIRMED' && <button className="button button-small button-outline" onClick={() => onAction(appointment, { status: 'COMPLETED' })}>Complete</button>}{role === 'DOCTOR' && <button className="text-action" onClick={() => setDetailsOpen((open) => !open)}>Consultation details</button>}{role === 'PATIENT' && ['PENDING', 'CONFIRMED'].includes(appointment.status) && <><button className="text-action" onClick={() => setRescheduleOpen((open) => !open)}>Reschedule</button><button className="text-danger" onClick={() => onAction(appointment, { status: 'CANCELLED' })}>Cancel</button></>}</div>{rescheduleOpen && <form className="appointment-inline-form" onSubmit={(event) => { event.preventDefault(); if (!newTime || new Date(newTime) <= new Date()) { pushToast('Choose a future appointment time.', 'error'); return; } onAction(appointment, { startsAt: new Date(newTime).toISOString() }); setRescheduleOpen(false); }}><label className="field"><span>New date and time</span><input type="datetime-local" value={newTime} onChange={(event) => setNewTime(event.target.value)} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} required /></label><button className="button button-small button-primary">Save time</button></form>}{detailsOpen && <form className="appointment-inline-form consultation-form" onSubmit={saveDetails}><label className="field"><span>Consultation notes</span><textarea name="consultationNotes" maxLength={5000} rows={3} placeholder="Add a private clinical note" /></label><label className="field"><span>Video consultation URL</span><input name="consultationLink" type="url" placeholder="https://…" /></label><label className="field"><span>Follow-up date</span><input name="followUpAt" type="datetime-local" /></label><button className="button button-small button-primary" disabled={savingDetails}>{savingDetails ? 'Saving…' : 'Save details'} <Check size={14} /></button></form>}</article>;
}

function MonitoringView({ role, vitals, onChanged }: { role: Role; vitals: Vital[]; onChanged: () => Promise<void> }) {
  const patient = role === 'PATIENT';
  const { pushToast } = useToasts();
  const [metric, setMetric] = useState('heartRate');
  const [saving, setSaving] = useState(false);
  const metricMap: Record<string, { label: string; unit: string; color: string }> = { heartRate: { label: 'Heart rate', unit: 'bpm', color: '#168c70' }, spo2: { label: 'Oxygen saturation', unit: '%', color: '#3676b8' }, systolic: { label: 'Systolic pressure', unit: 'mmHg', color: '#dc795d' }, temperatureC: { label: 'Temperature', unit: '°C', color: '#ae8650' }, glucoseMgDl: { label: 'Glucose', unit: 'mg/dL', color: '#7164a7' } };
  const selected = metricMap[metric];
  const chartData = vitals.slice(0, 60).reverse().map((item) => ({ ...item, time: formatDate(item.measuredAt, { hour: 'numeric', minute: '2-digit' }) }));
  const saveReading = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Record<string, number | string> = { deviceId: 'manual-entry' };
    ['heartRate', 'spo2', 'systolic', 'diastolic', 'temperatureC', 'glucoseMgDl'].forEach((key) => {
      const value = data.get(key);
      if (value !== null && String(value) !== '') payload[key] = Number(value);
    });
    setSaving(true);
    try { const result = await apiPost<{ risk: Risk }>('/vitals/ingest', payload); await onChanged(); pushToast(`Reading saved. Risk level: ${result.risk.level}.`); form.reset(); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Could not save readings.', 'error'); }
    finally { setSaving(false); }
  };
  return <div className="monitoring-layout"><div className="vitals-stat-grid"><VitalMetric label="Heart rate" value={vitals[0]?.heartRate} unit="bpm" range="Typical: 50–110" tone="mint" icon={HeartPulse} /><VitalMetric label="SpO₂" value={vitals[0]?.spo2} unit="%" range="Typical: 94–100" tone="blue" icon={Activity} /><VitalMetric label="Blood pressure" value={vitals[0]?.systolic && vitals[0]?.diastolic ? `${vitals[0].systolic}/${vitals[0].diastolic}` : undefined} unit="mmHg" range="Typical: < 120/80" tone="coral" icon={Activity} /><VitalMetric label="Temperature" value={vitals[0]?.temperatureC} unit="°C" range="Typical: 36.1–37.2" tone="gold" icon={Activity} /><VitalMetric label="Glucose" value={vitals[0]?.glucoseMgDl} unit="mg/dL" range="Typical: varies by person" tone="violet" icon={Activity} /></div><Panel title={`${selected.label} trend`} icon={Activity} action={<label className="chart-select"><span className="sr-only">Choose metric</span><select value={metric} onChange={(event) => setMetric(event.target.value)}>{Object.entries(metricMap).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>}>
      <div className="monitor-chart-meta"><span><i style={{ backgroundColor: selected.color }} />{selected.label} ({selected.unit})</span><span>Updates every 10 seconds</span></div>{chartData.length ? <div className="chart-wrap chart-tall"><ResponsiveContainer width="100%" height="310"><LineChart data={chartData} margin={{ top: 14, right: 12, bottom: 0, left: -18 }}><CartesianGrid strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={25} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey={metric} name={`${selected.label} (${selected.unit})`} stroke={selected.color} strokeWidth={2.7} dot={{ r: 3, fill: selected.color }} activeDot={{ r: 5 }} connectNulls /></LineChart></ResponsiveContainer></div> : <EmptyState icon={Activity} title="Waiting for your first reading" text="Connect a device or add a reading below to start monitoring." />}</Panel>
      {patient && <Panel title="Add a reading" icon={Plus}><form className="vitals-entry-form" onSubmit={saveReading}>{[['heartRate', 'Heart rate', 'bpm'], ['spo2', 'SpO₂', '%'], ['systolic', 'Systolic BP', 'mmHg'], ['diastolic', 'Diastolic BP', 'mmHg'], ['temperatureC', 'Temperature', '°C'], ['glucoseMgDl', 'Glucose', 'mg/dL']].map(([key, label, unit]) => <label className="field" key={key}><span>{label} <small>{unit}</small></span><input name={key} type="number" step={key === 'temperatureC' ? '0.1' : '1'} /></label>)}<button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save reading'} <ArrowRight size={15} /></button></form><p className="form-note">Enter values from a trusted device. This platform does not diagnose conditions.</p></Panel>}
      <Panel title="Recent readings" icon={ClipboardList}><ReadingsTable vitals={vitals.slice(0, 12)} /></Panel>
    </div>;
}

function VitalMetric({ label, value, unit, range, tone, icon: Icon }: { label: string; value?: string | number; unit: string; range: string; tone: string; icon: typeof Users }) {
  return <article className="vital-metric"><div className={`stat-icon tone-${tone}`}><Icon size={17} /></div><span>{label}</span><strong>{value ?? '—'}<small>{value !== undefined ? unit : ''}</small></strong><small className="vital-range">{range}</small></article>;
}

function ReadingsTable({ vitals }: { vitals: Vital[] }) {
  if (!vitals.length) return <EmptyState icon={Activity} title="No readings to show" text="Vitals appear when entered manually or sent by a device." />;
  return <div className="records-table-wrap"><table className="data-table"><thead><tr><th>Recorded</th><th>Heart rate</th><th>SpO₂</th><th>Blood pressure</th><th>Temp.</th><th>Glucose</th></tr></thead><tbody>{vitals.map((item) => <tr key={item._id}><td>{formatDate(item.measuredAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td>{item.heartRate ?? '—'}{item.heartRate ? ' bpm' : ''}</td><td>{item.spo2 ?? '—'}{item.spo2 ? '%' : ''}</td><td>{item.systolic && item.diastolic ? `${item.systolic}/${item.diastolic}` : '—'}</td><td>{item.temperatureC ?? '—'}{item.temperatureC ? '°C' : ''}</td><td>{item.glucoseMgDl ?? '—'}</td></tr>)}</tbody></table></div>;
}

function InsightsView({ role, summary, vitals, alerts, onAcknowledge }: { role: Role; summary: Record<string, any>; vitals: Vital[]; alerts: AlertItem[]; onAcknowledge: (id: string) => void }) {
  const risk = summary.risk as Risk | undefined;
  const myAlerts = role === 'PATIENT' ? alerts : alerts.filter((alert) => alert.level === 'HIGH');
  return <div className="insights-layout"><section className={`risk-summary-card risk-${(risk?.level || 'low').toLowerCase()}`}><div className="risk-summary-top"><span className="risk-orb"><Sparkles size={22} /></span><span><small>RULE-BASED DECISION SUPPORT</small><b>{risk?.level || 'NO RECENT DATA'} RISK</b></span><span className="risk-score">{risk ? `${risk.score}` : '—'}<small>score</small></span></div><h2>{risk?.level === 'HIGH' ? 'A reading needs prompt attention.' : risk?.level === 'MEDIUM' ? 'A reading may be worth a closer look.' : risk?.level === 'LOW' ? 'Your latest readings look within typical ranges.' : 'Add a reading to see an explanation.'}</h2><p>{risk?.reasons?.length ? 'Here is what contributed to this flag.' : 'This summary uses the most recent vitals submitted to your workspace.'}</p><div className="risk-disclaimer"><ShieldCheck size={16} /><span>Decision support, not a diagnosis. It does not replace advice from your clinician.</span></div></section>
    <div className="dashboard-columns"><Panel title="What contributed" icon={Activity}>{risk?.reasons?.length ? <ul className="reason-list">{risk.reasons.map((reason) => <li key={reason}><span className="reason-marker" />{reason}</li>)}</ul> : <EmptyState icon={Check} title="No unusual values identified" text="The engine flags only submitted values that cross its configured thresholds." />}</Panel><Panel title="Suggested next steps" icon={Sparkles}><ul className="recommendation-list">{(risk?.recommendations || ['Continue routine monitoring and follow your clinician’s care plan.']).map((recommendation) => <li key={recommendation}><Check size={15} />{recommendation}</li>)}</ul><p className="disclaimer-note">These suggestions are informational only. Seek urgent care for severe symptoms.</p></Panel></div>
    <Panel title="Alert history" icon={Bell}>{myAlerts.length ? <div className="alert-list">{myAlerts.map((alert) => <div className={`health-alert alert-${alert.level.toLowerCase()}`} key={alert._id}><span className="alert-dot" /><div><div className="alert-title-row"><b>{alert.level} reading</b><small>{dateTime(alert.createdAt)}</small></div><p>{alert.reasons.join(' ')}</p>{alert.recommendation && <span className="alert-recommendation">{alert.recommendation}</span>}</div>{!alert.acknowledgedAt && <button className="button button-small button-outline" onClick={() => onAcknowledge(alert._id)}>Acknowledge</button>}</div>)}</div> : <EmptyState icon={ShieldCheck} title="No alerts to review" text={`${vitals.length} recent readings are available in monitoring.`} />}</Panel>
  </div>;
}

function NotificationsView({ notifications, onMarkRead }: { notifications: NotificationItem[]; onMarkRead: (id: string) => void }) {
  return <Panel title="Notification center" icon={Bell} action={<span className="record-total">{notifications.filter((item) => !item.readAt).length} unread</span>}>{notifications.length ? <div className="notification-list notification-full-list">{notifications.map((notification) => <div className={`notification-row ${notification.readAt ? '' : 'unread'}`} key={notification._id}><span className="notification-type-icon"><Bell size={16} /></span><div><b>{notification.title}</b><p>{notification.message}</p><small>{dateTime(notification.createdAt)} · {notification.type.replace('_', ' ')}</small></div>{!notification.readAt && <button className="button button-small button-outline" onClick={() => onMarkRead(notification._id)}>Mark read</button>}</div>)}</div> : <EmptyState icon={Bell} title="You're all caught up" text="Appointment reminders and health updates will appear here." />}</Panel>;
}

function PeopleView({ role, users = [], appointments = [], alerts = [], auditItems = [], onApprove }: { role: Role; users?: AdminUser[]; appointments?: Appointment[]; alerts?: AlertItem[]; auditItems?: Record<string, any>[]; onApprove?: (user: AdminUser) => void }) {
  const adminView = role === 'ADMIN';
  const { pushToast } = useToasts();
  const [query, setQuery] = useState('');
  const pending = users.filter((person) => person.role === 'DOCTOR' && !person.isApproved);
  const visibleUsers = users.filter((person) => `${person.name} ${person.email} ${person.role}`.toLowerCase().includes(query.toLowerCase()));
  const exportData = async () => {
    try {
      const data = await apiRequest<Record<string, unknown>>('/admin/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `smart-healthcare-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
      pushToast('Administrative export downloaded.');
    } catch (error) { pushToast(error instanceof Error ? error.message : 'Export failed.', 'error'); }
  };
  if (role === 'DOCTOR') return <DoctorPatients appointments={appointments} />;
  if (!adminView) return <div className="people-patient-layout"><Panel title="Your care team" icon={Users}>{appointments.length ? appointments.map((appointment) => { const clinician = appointment.doctorId as { _id?: string; name?: string } | undefined; return <div className="people-row" key={appointment._id}><span className="person-avatar clinician-avatar"><Stethoscope size={16} /></span><span><b>{clinician?.name || 'Care team clinician'}</b><small>{appointment.status} · {dateTime(appointment.startsAt)}</small></span><StatusBadge value={appointment.status} /></div>; }) : <EmptyState icon={Users} title="Your care team will appear here" text="Book an appointment with an approved clinician to start connecting your care." />}</Panel><AlertsCard alerts={alerts.filter((alert) => alert.level === 'HIGH')} onAcknowledge={() => undefined} /></div>;
  return <div className="admin-people-layout"><div className="stat-grid three"><StatCard icon={Users} label="All accounts" value={users.length} detail="Registered platform users" tone="blue" /><StatCard icon={Stethoscope} label="Doctors" value={users.filter((user) => user.role === 'DOCTOR').length} detail="Approved and pending" tone="mint" /><StatCard icon={AlarmClock} label="Pending review" value={pending.length} detail="Doctor credentials" tone="gold" /></div><Panel title="User directory & doctor credential review" icon={Users} action={<button className="button button-small button-outline" onClick={exportData}><ArrowDownToLine size={14} /> Export data</button>}><div className="record-filters"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" /></label><span className="record-total">{visibleUsers.length} accounts</span></div><div className="records-table-wrap"><table className="data-table"><thead><tr><th>Person</th><th>Role</th><th>Doctor credentials</th><th>Status</th><th>Joined</th><th>Action</th></tr></thead><tbody>{visibleUsers.map((person) => <tr key={person._id}><td><span className="table-person"><span className="person-avatar">{initials(person.name)}</span><span><b>{person.name}</b><small>{person.email}</small></span></span></td><td>{person.role}</td><td>{person.role === 'DOCTOR' ? <span>{person.specialization || 'Specialization missing'}<small className="table-secondary">License: {person.licenseNumber || 'Not provided'}</small></span> : '—'}</td><td><StatusBadge value={person.role === 'DOCTOR' && !person.isApproved ? 'PENDING REVIEW' : person.isActive ? 'ACTIVE' : 'INACTIVE'} /></td><td>{formatDate(person.createdAt)}</td><td>{person.role === 'DOCTOR' && !person.isApproved ? <button className="button button-small button-primary" onClick={() => onApprove?.(person)}>Approve</button> : '—'}</td></tr>)}</tbody></table></div></Panel><Panel title="Audit history" icon={LockKeyhole}><AuditPreview items={auditItems} /></Panel></div>;
}

type PatientSummary = { _id: string; name: string };
type PatientDetail = { bloodGroup?: string; allergies?: string[]; chronicConditions?: string[] };

function DoctorPatients({ appointments }: { appointments: Appointment[] }) {
  const [selected, setSelected] = useState<PatientSummary | null>(null);
  const [patientInfo, setPatientInfo] = useState<PatientDetail | null>(null);
  const [patientRecords, setPatientRecords] = useState<HealthRecord[]>([]);
  const [patientVitals, setPatientVitals] = useState<Vital[]>([]);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const { pushToast } = useToasts();
  const people = Array.from(new Map(appointments.flatMap((appointment) => {
    if (!appointment.patientId) return [];
    const patient = typeof appointment.patientId === 'object' ? appointment.patientId : { _id: appointment.patientId, name: 'Patient' };
    return [[patient._id, { _id: patient._id, name: patient.name } as PatientSummary]];
  })).values());

  const openPatient = async (patient: PatientSummary) => {
    setSelected(patient);
    setLoadingPatient(true);
    try {
      const [profile, records, vitals] = await Promise.all([
        apiRequest<PatientDetail>(`/patients/${patient._id}`),
        apiRequest<PageData<HealthRecord>>(`/records?patientId=${patient._id}&limit=20`),
        apiRequest<PageData<Vital>>(`/vitals?patientId=${patient._id}&limit=20`)
      ]);
      setPatientInfo(profile);
      setPatientRecords(extractItems(records));
      setPatientVitals(extractItems(vitals));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Patient information could not be loaded.', 'error');
      setPatientInfo(null);
    } finally {
      setLoadingPatient(false);
    }
  };

  return <div className="patient-care-layout"><Panel title="Patients in your schedule" icon={Users} action={<span className="record-total">{people.length} patients</span>}>{people.length ? people.map((patient) => <div className={`people-row ${selected?._id === patient._id ? 'selected-person' : ''}`} key={patient._id}><span className="person-avatar">{initials(patient.name)}</span><span><b>{patient.name}</b><small>Care relationship · {appointments.filter((appointment) => String((appointment.patientId as { _id?: string })?._id || appointment.patientId) === patient._id).length} appointments</small></span><button className="button button-small button-outline" onClick={() => void openPatient(patient)}>Review record</button></div>) : <EmptyState icon={Users} title="No patients in your schedule" text="Patients with an appointment or sharing consent will appear here." />}</Panel>
    {selected ? <div className="patient-detail-stack">{loadingPatient ? <div className="dashboard-panel patient-loading">Loading authorized patient information…</div> : <><Panel title={selected.name} icon={UserRound}><div className="patient-facts"><div><span>Blood group</span><b>{patientInfo?.bloodGroup || 'Not recorded'}</b></div><div><span>Allergies</span><b>{patientInfo?.allergies?.join(', ') || 'None recorded'}</b></div><div><span>Chronic conditions</span><b>{patientInfo?.chronicConditions?.join(', ') || 'None recorded'}</b></div></div></Panel><Panel title="Recent readings" icon={Activity}><ReadingsTable vitals={patientVitals.slice(0, 6)} /></Panel><Panel title="Shared health records" icon={FileHeart}>{patientRecords.length ? <div className="record-mini-list">{patientRecords.map((record) => <div className="record-mini" key={record._id}><span className="record-mini-icon"><FileHeart size={15} /></span><span><b>{record.title}</b><small>{record.category.replace('_', ' ')} · {formatDate(record.recordedAt)}</small></span></div>)}</div> : <EmptyState icon={FileHeart} title="No shared records" text="The patient has not added records yet." />}</Panel><PrescriptionForm patientId={selected._id} /></>}</div> : <div className="dashboard-panel patient-selection-empty"><EmptyState icon={FileHeart} title="Choose a patient" text="Review patient details, recent vitals and shared records from your current care schedule." /></div>}</div>;
}

function PrescriptionForm({ patientId }: { patientId: string }) {
  const { pushToast } = useToasts();
  const [saving, setSaving] = useState(false);
  const createPrescription = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    try {
      await apiPost('/prescriptions', { patientId, medication: data.get('medication'), dosage: data.get('dosage'), instructions: data.get('instructions') });
      form.reset();
      pushToast('Prescription added to the patient record.');
    } catch (error) { pushToast(error instanceof Error ? error.message : 'Prescription could not be saved.', 'error'); }
    finally { setSaving(false); }
  };
  return <Panel title="Add prescription" icon={ClipboardList}><form className="prescription-form" onSubmit={createPrescription}><label className="field"><span>Medication</span><input name="medication" required maxLength={160} /></label><label className="field"><span>Dosage</span><input name="dosage" required maxLength={120} placeholder="e.g. 10 mg, once daily" /></label><label className="field"><span>Instructions</span><input name="instructions" maxLength={1000} placeholder="Optional instructions" /></label><button className="button button-primary button-small" disabled={saving}>{saving ? 'Saving…' : 'Add prescription'} <ArrowRight size={14} /></button></form></Panel>;
}

function SettingsView({ role, consent, onConsent }: { role: Role; consent: boolean; onConsent: (next: boolean) => void }) {
  const { session } = useAuth();
  return <div className="settings-layout"><Panel title="Account details" icon={UserRound}><div className="settings-profile"><span className="settings-avatar">{initials(session!.user.name)}</span><span><b>{session!.user.name}</b><small>{session!.user.email}</small></span><StatusBadge value={role} /></div><div className="settings-detail-row"><span>Account role</span><b>{roleLabel(role)}</b></div><div className="settings-detail-row"><span>Clinician approval</span><b>{role === 'DOCTOR' ? session!.user.isApproved ? 'Approved' : 'Pending review' : 'Not applicable'}</b></div><p className="settings-note">Profile details and account credentials are managed through your account registration. Contact your administrator for access changes.</p></Panel>{role === 'PATIENT' && <><PatientProfileEditor /><Panel title="Record sharing consent" icon={LockKeyhole}><div className="consent-control"><div><b>Allow clinicians with an active care relationship to access my record</b><p>You can change this preference at any time. Your own access to records is not affected.</p></div><label className="toggle-control"><input type="checkbox" checked={consent} onChange={(event) => onConsent(event.target.checked)} aria-label="Allow clinicians to access my records" /><span /></label></div><div className="consent-detail"><ShieldCheck size={16} /><span>Every record access is subject to role permissions and recorded in the audit trail.</span></div></Panel></>}<Panel title="Clinical decision support" icon={Sparkles}><div className="decision-note"><span className="decision-icon"><Sparkles size={17} /></span><p>Health risk flags are generated from configurable vital thresholds. They explain which values were flagged and offer general next steps. <b>They are not a diagnosis and do not replace medical advice.</b></p></div></Panel></div>;
}

type ProfileForm = { dateOfBirth?: string; phone?: string; bloodGroup?: string; allergies?: string[]; chronicConditions?: string[]; address?: string; emergencyContact?: { name?: string; relationship?: string; phone?: string } };

function PatientProfileEditor() {
  const [profile, setProfile] = useState<ProfileForm>({});
  const [saving, setSaving] = useState(false);
  const { pushToast } = useToasts();
  useEffect(() => {
    apiRequest<ProfileForm & { dateOfBirth?: string }>('/patients/me')
      .then((data) => setProfile(data))
      .catch(() => undefined);
  }, []);
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const phone = String(data.get('phone') || '').trim();
    const emergencyName = String(data.get('emergencyName') || '').trim();
    const emergencyRelationship = String(data.get('emergencyRelationship') || '').trim();
    const emergencyPhone = String(data.get('emergencyPhone') || '').trim();
    if ([emergencyName, emergencyRelationship, emergencyPhone].some(Boolean) && ![emergencyName, emergencyRelationship, emergencyPhone].every(Boolean)) {
      pushToast('Complete all emergency contact fields or leave them blank.', 'error');
      return;
    }
    const payload = {
      dateOfBirth: data.get('dateOfBirth') || undefined,
      phone: phone || undefined,
      bloodGroup: data.get('bloodGroup') || undefined,
      address: String(data.get('address') || '').trim() || undefined,
      allergies: String(data.get('allergies') || '').split(',').map((value) => value.trim()).filter(Boolean),
      chronicConditions: String(data.get('chronicConditions') || '').split(',').map((value) => value.trim()).filter(Boolean),
      emergencyContact: emergencyName ? { name: emergencyName, relationship: emergencyRelationship, phone: emergencyPhone } : undefined
    };
    setSaving(true);
    try { const updated = await apiRequest<ProfileForm>('/patients/me', { method: 'PATCH', body: JSON.stringify(payload) }); setProfile(updated); pushToast('Your patient profile has been updated.'); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Profile could not be saved.', 'error'); }
    finally { setSaving(false); }
  };
  const dobValue = profile.dateOfBirth ? profile.dateOfBirth.slice(0, 10) : '';
  return <Panel title="Patient profile" icon={FileHeart}><form key={JSON.stringify(profile)} className="profile-form" onSubmit={saveProfile}><label className="field"><span>Date of birth</span><input name="dateOfBirth" type="date" defaultValue={dobValue} /></label><label className="field"><span>Phone</span><input name="phone" defaultValue={profile.phone || ''} maxLength={30} /></label><label className="field"><span>Blood group</span><select name="bloodGroup" defaultValue={profile.bloodGroup || ''}><option value="">Not specified</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group}>{group}</option>)}</select></label><label className="field"><span>Allergies <small>comma separated</small></span><input name="allergies" defaultValue={profile.allergies?.join(', ') || ''} placeholder="e.g. penicillin" /></label><label className="field"><span>Chronic conditions <small>comma separated</small></span><input name="chronicConditions" defaultValue={profile.chronicConditions?.join(', ') || ''} /></label><label className="field"><span>Address</span><input name="address" defaultValue={profile.address || ''} maxLength={300} /></label><div className="profile-emergency"><b>Emergency contact</b><label className="field"><span>Name</span><input name="emergencyName" defaultValue={profile.emergencyContact?.name || ''} /></label><label className="field"><span>Relationship</span><input name="emergencyRelationship" defaultValue={profile.emergencyContact?.relationship || ''} /></label><label className="field"><span>Phone</span><input name="emergencyPhone" defaultValue={profile.emergencyContact?.phone || ''} /></label></div><button className="button button-primary button-small" disabled={saving}>{saving ? 'Saving…' : 'Save profile'} <Check size={14} /></button></form></Panel>;
}
import { ArrowLeft, ArrowRight, HeartPulse, ShieldCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, useToasts } from '../app/providers';
import { apiPost, loginRequest, registerRequest } from '../services/api';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
const formSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  role: z.enum(['PATIENT', 'DOCTOR']).optional(),
  specialization: z.string().optional(),
  licenseNumber: z.string().optional()
});
type AuthInput = z.infer<typeof formSchema>;

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { setSession } = useAuth();
  const { pushToast } = useToasts();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token');
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const heading = useMemo(() => isRegister ? 'Create your account' : isForgot ? 'Reset your password' : isReset ? 'Choose a new password' : 'Welcome back', [isRegister, isForgot, isReset]);
  const modeSchema = useMemo(() => formSchema.superRefine((values, context) => {
    const issue = (path: keyof AuthInput, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!isReset && !z.string().email().safeParse(values.email).success) issue('email', 'Enter a valid email address.');
    if (isRegister && (!values.name || values.name.trim().length < 2)) issue('name', 'Enter your full name.');
    if ((isRegister || mode === 'login' || isReset) && (!values.password || values.password.length < 10)) issue('password', 'Use at least 10 characters.');
    if (isRegister && values.role === 'DOCTOR') {
      if (!values.specialization || values.specialization.trim().length < 2) issue('specialization', 'Enter a medical specialization.');
      if (!values.licenseNumber || values.licenseNumber.trim().length < 3) issue('licenseNumber', 'Enter your license number.');
    }
  }), [isRegister, isReset, mode]);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<AuthInput>({
    resolver: zodResolver(modeSchema),
    defaultValues: { role: 'PATIENT' }
  });
  const selectedRole = watch('role');

  const submit = async (values: AuthInput) => {
    try {
      if (isRegister) {
        const session = await registerRequest({ ...values, name: values.name, role: values.role || 'PATIENT' });
        setSession(session);
        pushToast(session.user.isApproved ? 'Your secure workspace is ready.' : 'Your clinician account is waiting for approval.', 'success', 'Account created');
        navigate('/app');
        return;
      }
      if (isForgot) {
        await apiPost('/auth/forgot-password', { email: values.email || '' });
        pushToast('If the account exists, a reset link has been sent.', 'info', 'Check your inbox');
        navigate('/login');
        return;
      }
      if (isReset) {
        await apiPost('/auth/reset-password', { token: resetToken, password: values.password });
        pushToast('Your password has been updated. Sign in to continue.', 'success', 'Password updated');
        navigate('/login');
        return;
      }
      const session = await loginRequest(values.email || '', values.password || '');
      setSession(session);
      pushToast(`Good to see you, ${session.user.name.split(' ')[0]}.`, 'success', 'Signed in');
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || '/app');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Please try again.', 'error');
    }
  };

  return <main className="auth-layout">
    <section className="auth-aside"><Link to="/" className="brand-lockup"><span className="brand-mark"><HeartPulse size={19} /></span><span>smart<span className="brand-light">care</span><small>CONNECTED HEALTH</small></span></Link><div className="auth-aside-copy"><span className="aside-badge"><ShieldCheck size={15} /> PRIVATE BY DESIGN</span><h1>Care information,<br /><em>in its right place.</em></h1><p>A connected space for your records, care team and health signals.</p></div><div className="auth-aside-bottom"><span>SMART HEALTHCARE CLOUD</span><span>DECISION SUPPORT, NOT A DIAGNOSIS.</span></div></section>
    <section className="auth-main"><div className="auth-form-wrap"><Link to="/" className="auth-back"><ArrowLeft size={15} /> Back to website</Link><div className="auth-heading"><span>{isRegister ? 'GET STARTED' : isForgot || isReset ? 'ACCOUNT SUPPORT' : 'SECURE ACCESS'}</span><h2>{heading}</h2><p>{isRegister ? 'Set up your connected care workspace.' : isForgot ? 'We’ll send a secure reset link if the account is registered.' : isReset ? 'Use a strong password you do not use elsewhere.' : 'Sign in to continue to your healthcare workspace.'}</p></div>
      <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
        {isRegister && <label className="field"><span>Full name</span><input {...register('name')} placeholder="Your name" aria-invalid={!!errors.name} />{errors.name && <small className="field-error">{errors.name.message}</small>}</label>}
        {!isReset && <label className="field"><span>Email address</span><input {...register('email')} type="email" placeholder="you@example.com" autoComplete="email" aria-invalid={!!errors.email} />{errors.email && <small className="field-error">{errors.email.message}</small>}</label>}
        {(isRegister || mode === 'login' || isReset) && <label className="field"><span>Password</span><input {...register('password')} type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="At least 10 characters" aria-invalid={!!errors.password} />{errors.password && <small className="field-error">{errors.password.message}</small>}</label>}
        {isRegister && <><fieldset className="role-choice"><legend>I’m joining as</legend><label className={selectedRole === 'PATIENT' ? 'selected' : ''}><input {...register('role')} type="radio" value="PATIENT" /><HeartPulse size={16} /> Patient</label><label className={selectedRole === 'DOCTOR' ? 'selected' : ''}><input {...register('role')} type="radio" value="DOCTOR" /><ShieldCheck size={16} /> Clinician</label></fieldset>{selectedRole === 'DOCTOR' && <div className="form-grid"><label className="field"><span>Specialization</span><input {...register('specialization')} placeholder="Cardiology" aria-invalid={!!errors.specialization} />{errors.specialization && <small className="field-error">{errors.specialization.message}</small>}</label><label className="field"><span>License number</span><input {...register('licenseNumber')} placeholder="Professional license" aria-invalid={!!errors.licenseNumber} />{errors.licenseNumber && <small className="field-error">{errors.licenseNumber.message}</small>}</label><p className="field-hint full-span">Clinician accounts require administrator approval before appearing in search.</p></div>}</>}
        <button className="button button-primary auth-submit" disabled={isSubmitting}>{isRegister ? 'Create account' : isForgot ? 'Send reset link' : isReset ? 'Update password' : 'Sign in'} <ArrowRight size={16} /></button>
      </form>
      {mode === 'login' && <div className="demo-access"><span>DEMO ACCESS</span><p>Use the seeded demo accounts with the configured `DEMO_PASSWORD`.</p><small>patient@demo.com · doctor@demo.com · admin@demo.com</small></div>}
      <div className="auth-switch">{mode === 'login' && <><Link to="/forgot-password">Forgot password?</Link><span>New to SmartCare? <Link to="/register">Create an account</Link></span></>}{isRegister && <span>Already registered? <Link to="/login">Sign in</Link></span>}{(isForgot || isReset) && <span>Remember your password? <Link to="/login">Sign in</Link></span>}</div>
      <div className="auth-disclaimer"><ShieldCheck size={14} /><span>Risk insights support care conversations. They are not a diagnosis.</span></div>
    </div></section>
  </main>;
}
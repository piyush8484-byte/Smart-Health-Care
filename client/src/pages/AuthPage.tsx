import { ArrowLeft, ArrowRight, HeartPulse, ShieldCheck, Stethoscope } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, useToasts } from '../app/providers';
import { apiPost, loginRequest, registerRequest } from '../services/api';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const formSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  code: z.string().optional(),
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
  const isVerify = mode === 'verify';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const initialEmail = searchParams.get('email') || (location.state as { email?: string } | null)?.email || '';
  const isDevelopmentDelivery = searchParams.get('delivery') === 'development-console';
  const [resendCooldown, setResendCooldown] = useState(() => Math.max(0, Number(searchParams.get('cooldown')) || 0));
  const [verifyLink, setVerifyLink] = useState('');
  useEffect(() => {
    if (!resendCooldown) return;
    const timer = window.setTimeout(() => setResendCooldown((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);
  const heading = useMemo(() => isRegister ? 'Create your account' : isVerify ? 'Verify your email' : isForgot ? 'Reset your password' : isReset ? 'Choose a new password' : 'Welcome back', [isRegister, isVerify, isForgot, isReset]);
  const modeSchema = useMemo(() => formSchema.superRefine((values, context) => {
    const issue = (path: keyof AuthInput, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!isReset && !z.string().trim().email().safeParse(values.email).success) issue('email', 'Enter a valid email address.');
    if (isRegister && (!values.name || values.name.trim().length < 2)) issue('name', 'Enter your full name.');
    if (isRegister && (!values.password || values.password.length < 10)) issue('password', 'Use at least 10 characters.');
    if (isRegister && values.password !== values.confirmPassword) issue('confirmPassword', 'Passwords do not match.');
    if ((mode === 'login' || isReset) && !values.password) issue('password', 'Enter your password.');
    if (isReset && values.password && values.password.length < 10) issue('password', 'Use at least 10 characters.');
    if (isVerify && !/^\d{6}$/.test(values.code || '')) issue('code', 'Enter the six-digit verification code.');
    if (isRegister && values.role === 'DOCTOR') {
      if (!values.specialization || values.specialization.trim().length < 2) issue('specialization', 'Enter a medical specialization.');
      if (!values.licenseNumber || values.licenseNumber.trim().length < 3) issue('licenseNumber', 'Enter your license number.');
    }
  }), [isRegister, isVerify, isReset, mode]);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<AuthInput>({
    resolver: zodResolver(modeSchema),
    defaultValues: { role: 'PATIENT', email: initialEmail }
  });
  const selectedRole = watch('role');
  const email = watch('email') || initialEmail;

  const resendVerification = async () => {
    if (!email || resendCooldown) return;
    try {
      const result = await apiPost<{ cooldownSeconds: number; delivery: 'smtp' | 'development-console' } | null>('/auth/resend-verification', { email: email.trim().toLowerCase() });
      setResendCooldown(result?.cooldownSeconds || 60);
      const isDevelopmentDelivery = result?.delivery === 'development-console';
      setVerifyLink(isDevelopmentDelivery
        ? 'Email is not configured. For local development, check the API server terminal for the verification code.'
        : 'If your account needs verification, a new code has been sent to your email.');
      pushToast(
        isDevelopmentDelivery ? 'The development verification code is in the API server terminal.' : 'If your account needs verification, a new code has been sent.',
        'info',
        isDevelopmentDelivery ? 'Development email mode' : 'Check your inbox'
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not resend the verification code.', 'error');
    }
  };

  const submit = async (values: AuthInput) => {
    try {
      if (isRegister) {
        const registration = await registerRequest({
          ...values,
          name: values.name?.trim(),
          email: values.email?.trim().toLowerCase(),
          role: values.role || 'PATIENT'
        });
        const localDelivery = registration.delivery === 'development-console';
        pushToast(
          localDelivery
            ? 'Account created. No email was sent; check the API server terminal for the local verification code.'
            : 'Account created. Enter the verification code sent to your email.',
          localDelivery ? 'info' : 'success',
          localDelivery ? 'Local email mode' : 'Verify your email'
        );
        navigate(`/verify-email?email=${encodeURIComponent(registration.email)}&delivery=${registration.delivery}&cooldown=${registration.cooldownSeconds}`);
        return;
      }
      if (isVerify) {
        await apiPost('/auth/verify-email', { email: values.email?.trim().toLowerCase(), code: values.code });
        pushToast('Your account has been verified. Sign in to continue.', 'success', 'Account verified');
        navigate('/login', { state: { email: values.email?.trim().toLowerCase() } });
        return;
      }
      if (isForgot) {
        await apiPost('/auth/forgot-password', { email: values.email?.trim().toLowerCase() || '' });
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
      const session = await loginRequest(values.email?.trim().toLowerCase() || '', values.password || '');
      setSession(session);
      pushToast(
        session.user.role === 'DOCTOR' && !session.user.isApproved
          ? 'Signed in. Your doctor credentials are awaiting administrator review.'
          : `Good to see you, ${session.user.name.split(' ')[0]}.`,
        'success',
        'Signed in'
      );
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || '/app');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      if (mode === 'login' && message.includes('verify your account')) {
        setVerifyLink('Please verify your email address before signing in.');
      }
      pushToast(message, 'error');
    }
  };

  return <main className="auth-layout">
    <section className="auth-aside"><Link to="/" className="brand-lockup"><span className="brand-mark"><HeartPulse size={19} /></span><span>smart<span className="brand-light">care</span><small>CONNECTED HEALTH</small></span></Link><div className="auth-aside-copy"><span className="aside-badge"><ShieldCheck size={15} /> PRIVATE BY DESIGN</span><h1>Care information,<br /><em>in its right place.</em></h1><p>A connected space for your records, care team and health signals.</p></div><div className="auth-aside-bottom"><span>SMART HEALTHCARE CLOUD</span><span>DECISION SUPPORT, NOT A DIAGNOSIS.</span></div></section>
    <section className="auth-main"><div className="auth-form-wrap"><Link to="/" className="auth-back"><ArrowLeft size={15} /> Back to website</Link><div className="auth-heading"><span>{isRegister ? 'GET STARTED' : isVerify ? 'EMAIL VERIFICATION' : isForgot || isReset ? 'ACCOUNT SUPPORT' : 'SECURE ACCESS'}</span><h2>{heading}</h2><p>{isRegister ? 'Set up your connected care workspace.' : isVerify ? 'Enter the six-digit code sent to your email. The code expires in 10 minutes.' : isForgot ? 'We’ll send a secure reset link if the account is registered.' : isReset ? 'Use a strong password you do not use elsewhere.' : 'Sign in to open your patient or doctor workspace.'}</p></div>
      <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
        {isRegister && <label className="field"><span>Full name</span><input {...register('name')} placeholder="Your name" aria-invalid={!!errors.name} />{errors.name && <small className="field-error">{errors.name.message}</small>}</label>}
        {!isReset && <label className="field"><span>Email address</span><input {...register('email')} type="email" placeholder="you@example.com" autoComplete="email" readOnly={isVerify && !!initialEmail} aria-invalid={!!errors.email} />{errors.email && <small className="field-error">{errors.email.message}</small>}</label>}
        {(isRegister || mode === 'login' || isReset) && <label className="field"><span>Password</span><input {...register('password')} type="password" autoComplete={isRegister || isReset ? 'new-password' : 'current-password'} placeholder={isRegister || isReset ? 'At least 10 characters' : 'Enter your password'} aria-invalid={!!errors.password} />{errors.password && <small className="field-error">{errors.password.message}</small>}</label>}
        {isRegister && <label className="field"><span>Confirm password</span><input {...register('confirmPassword')} type="password" autoComplete="new-password" placeholder="Enter your password again" aria-invalid={!!errors.confirmPassword} />{errors.confirmPassword && <small className="field-error">{errors.confirmPassword.message}</small>}</label>}
        {isVerify && <label className="field"><span>Six-digit verification code</span><input {...register('code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" aria-invalid={!!errors.code} />{errors.code && <small className="field-error">{errors.code.message}</small>}</label>}
        {isRegister && <><fieldset className="role-choice"><legend>I’m joining as</legend><label className={selectedRole === 'PATIENT' ? 'selected' : ''}><input {...register('role')} type="radio" value="PATIENT" /><HeartPulse size={16} /> Patient</label><label className={selectedRole === 'DOCTOR' ? 'selected' : ''}><input {...register('role')} type="radio" value="DOCTOR" /><Stethoscope size={16} /> Doctor</label></fieldset>{selectedRole === 'DOCTOR' && <div className="form-grid"><label className="field"><span>Specialization</span><input {...register('specialization')} placeholder="Cardiology" aria-invalid={!!errors.specialization} />{errors.specialization && <small className="field-error">{errors.specialization.message}</small>}</label><label className="field"><span>Medical license number</span><input {...register('licenseNumber')} placeholder="Professional license" aria-invalid={!!errors.licenseNumber} />{errors.licenseNumber && <small className="field-error">{errors.licenseNumber.message}</small>}</label><p className="field-hint full-span">Doctors can sign in after email verification. An administrator must review credentials before the profile appears to patients.</p></div>}</>}
        <button className="button button-primary auth-submit" disabled={isSubmitting}>{isRegister ? 'Create account' : isVerify ? 'Verify email' : isForgot ? 'Send reset link' : isReset ? 'Update password' : mode === 'login' ? 'Sign in' : 'Continue'} {isSubmitting ? '…' : <ArrowRight size={16} />}</button>
      </form>
      {(verifyLink || isVerify) && <div className="verification-help"><p>{verifyLink || (isDevelopmentDelivery ? 'Email is not configured. For local development, check the API server terminal for the verification code.' : 'A verification code is required before you can sign in.')}</p>{mode === 'login' && <Link to={`/verify-email?email=${encodeURIComponent(email)}`}>Enter or resend verification code</Link>}</div>}
      {isVerify && <div className="auth-switch"><button type="button" className="text-action" onClick={() => void resendVerification()} disabled={!email || resendCooldown > 0}>{resendCooldown ? `Resend code in ${resendCooldown}s` : 'Resend verification code'}</button><Link to="/login">Back to sign in</Link></div>}
      <div className="auth-switch">{mode === 'login' && <><Link to="/forgot-password">Forgot password?</Link><span>New to SmartCare? <Link to="/register">Create an account</Link></span></>}{isRegister && <span>Already registered? <Link to="/login">Sign in</Link></span>}{(isForgot || isReset) && <span>Remember your password? <Link to="/login">Sign in</Link></span>}</div>
      <div className="auth-disclaimer"><ShieldCheck size={14} /><span>Risk insights support care conversations. They are not a diagnosis.</span></div>
    </div></section>
  </main>;
}
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { readSession, writeSession, type Session } from '../services/api';

type AuthValue = {
  session: Session | null;
  setSession: (session: Session | null) => void;
  signOut: () => void;
};
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setCurrentSession] = useState<Session | null>(() => readSession());
  const setSession = (next: Session | null) => {
    writeSession(next);
    setCurrentSession(next);
  };
  const signOut = () => setSession(null);
  useEffect(() => {
    const sync = () => setCurrentSession(readSession());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return <AuthContext.Provider value={{ session, setSession, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

type Notice = { id: number; title: string; message: string; tone: 'success' | 'error' | 'info' };
type ToastValue = { notices: Notice[]; pushToast: (message: string, tone?: Notice['tone'], title?: string) => void; dismissToast: (id: number) => void };
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const pushToast = (message: string, tone: Notice['tone'] = 'success', title = tone === 'error' ? 'Something went wrong' : 'Done') => {
    const id = Date.now() + Math.random();
    setNotices((current) => [...current, { id, title, message, tone }]);
    window.setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), 5200);
  };
  const dismissToast = (id: number) => setNotices((current) => current.filter((notice) => notice.id !== id));
  return <ToastContext.Provider value={{ notices, pushToast, dismissToast }}>{children}</ToastContext.Provider>;
}

export function useToasts(): ToastValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToasts must be used inside ToastProvider');
  return context;
}

type ThemeValue = { dark: boolean; toggleTheme: () => void };
const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => localStorage.getItem('smart-healthcare.theme') === 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('smart-healthcare.theme', dark ? 'dark' : 'light');
  }, [dark]);
  return <ThemeContext.Provider value={{ dark, toggleTheme: () => setDark((value) => !value) }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
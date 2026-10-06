import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../app/providers';
import type { Role } from '../services/api';

export default function RouteGuard({ roles }: { roles?: Role[] }) {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(session.user.role)) return <Navigate to="/app" replace />;
  return <Outlet />;
}
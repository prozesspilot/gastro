/**
 * M14 — ProtectedRoute
 *
 * - Leitet zu /login wenn kein User
 * - Leitet zu /change-password wenn password_must_change
 * - Optional: Permission-Check (`requirePermission` Prop)
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface Props {
  children: React.ReactNode;
  /** Optionale Permission, die erforderlich ist (z. B. "users.manage"). */
  requirePermission?: string;
}

export default function ProtectedRoute({ children, requirePermission }: Props) {
  const { user, isLoading, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
          fontSize: 14,
        }}
      >
        Wird geladen…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Forced password change: nur /change-password + /login erlaubt
  if (user.password_must_change && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (requirePermission && !hasPermission(requirePermission)) {
    return (
      <div
        role="alert"
        style={{
          padding: '32px',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        Du hast keine Berechtigung für diese Seite ({requirePermission}).
      </div>
    );
  }

  return <>{children}</>;
}

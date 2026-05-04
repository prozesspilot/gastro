/**
 * D2 — ProtectedRoute
 *
 * Leitet zur LoginPage weiter wenn kein User eingeloggt ist.
 * Zeigt Skeleton-Loading während Auth-State geladen wird.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { user, isLoading } = useAuth();
  const location            = useLocation();

  if (isLoading) {
    // Kurzes Flackern vermeiden — zeige nichts bis Auth-State bekannt
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
    // Redirect zur Login-Page, current URL als `from` Parameter speichern
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

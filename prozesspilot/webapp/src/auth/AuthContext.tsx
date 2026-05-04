/**
 * D2 — Auth-Flow
 *
 * Einfacher Auth-Context für ProzessPilot.
 * In Dev (PP_AUTH_DISABLED=1 am Backend) wird kein echter Token benötigt —
 * der "Login" setzt nur den Tenant-Kontext in sessionStorage.
 *
 * Token-Strategie: sessionStorage (nicht localStorage) für XSS-Härtung.
 * Beim Tab-Schließen wird die Session automatisch beendet.
 *
 * DECISION: HMAC-Signierung läuft server-seitig (n8n → Backend).
 * Die Webapp nutzt keinen HMAC — sie setzt nur x-pp-tenant-id Header.
 * LoginPage ist daher ein "Tenant-Select" mit optionalem Password-Feld
 * (für zukünftige echte Auth).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { setActiveTenantId } from '../api/_client';

const SESSION_KEY = 'pp_session';

export interface AuthUser {
  tenantId:    string;
  tenantName:  string;
  displayName: string;
  // In Phase 3: JWT-Token für echte Auth
  token?: string;
}

interface AuthContextValue {
  user:    AuthUser | null;
  isLoading: boolean;
  login:   (user: AuthUser) => void;
  logout:  () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Session aus sessionStorage wiederherstellen
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        setUser(parsed);
        setActiveTenantId(parsed.tenantId);
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = (newUser: AuthUser) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
    setActiveTenantId(newUser.tenantId);
    setUser(newUser);
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider genutzt werden');
  return ctx;
}

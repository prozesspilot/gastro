/**
 * M14 — AuthContext
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §6.5
 *
 * - Access-Token: in-memory (useState) — beim Reload via /auth/refresh wiederhergestellt
 * - Refresh-Token: HttpOnly Cookie, vom Backend gesetzt
 * - Permissions: live aus Token decoded oder via /auth/me
 * - Auto-Refresh: 60s vor Ablauf
 * - hasPermission: Wildcard-aware
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUserDto, M14SessionUser } from '../api/auth';
import * as authApi from '../api/auth';
import { setAuthHooks, setActiveTenantId } from '../api/_client';
import { matchPermission } from './permissions';
import { scheduleRefresh } from './token-refresh';

export interface AuthUser extends AuthUserDto {
  // alias for display (legacy code)
  displayName: string;
  tenantId: string | null;
  // M14: optional role field for Discord/emergency logins
  role?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  loginWithEmergency: (email: string, password: string, totpCode: string, backupCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshNow: () => Promise<string | null>;
  hasPermission: (perm: string) => boolean;
  updateLocalUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(dto: AuthUserDto): AuthUser {
  return {
    ...dto,
    displayName: dto.display_name,
    tenantId: dto.tenant_id,
  };
}

/**
 * Mappt einen M14-Session-User (Cookie-basiert) auf AuthUser.
 * permissions aus Rolle ableiten: geschaeftsfuehrer → ['*'], andere → Standard-Set.
 * Exportiert für den Unit-Test der Rollen-Permission-Map (T059).
 */
export function m14UserToAuthUser(sessionUser: M14SessionUser): AuthUser {
  // T059/A3-Bug-Fix: Permissions auf die belege-Welt (vorher receipts/tasks-Scopes =
  // Geister-Welt → mitarbeiter/support sahen nichts). Diese Map steuert die
  // UI-Sichtbarkeit. Das ist NICHT die einzige Durchsetzung: serverseitig gaten die
  // schreibenden Belege-Handler die Rolle selbst (T062, verifiziert) — `support` →
  // 403 bei PATCH/DELETE/categorize/Lexware-Export/Upload, DELETE + Batch-Export nur
  // `geschaeftsfuehrer`. Ausnahme: `reprocess` ist für `support` bewusst erlaubt
  // (read-only-Äquivalent für Operator, stößt nur OCR neu an). Ein API-Call am UI
  // vorbei wird also serverseitig abgewiesen — diese Map muss damit konsistent bleiben.
  const permissions: string[] =
    sessionUser.role === 'geschaeftsfuehrer'
      ? ['*']
      : sessionUser.role === 'support'
        ? ['belege.read', 'tenants.read']
        : ['belege.read', 'belege.write', 'tenants.read']; // mitarbeiter

  // DECISION: M14-Cookie-User hat tenant_id null (systemweite Mitarbeiter-Session).
  // B1: M14-Sessions haben keine Email im Frontend — display_name war fälschlich als email gesetzt.
  const dto: AuthUserDto = {
    id: sessionUser.id,
    email: '',
    display_name: sessionUser.display_name,
    tenant_id: null,
    permissions,
    preset: null,
    is_active: true,
    password_must_change: false,
    last_login_at: null,
    created_at: new Date().toISOString(),
  };
  return {
    ...dto,
    displayName: sessionUser.display_name,
    tenantId: null,
    role: sessionUser.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshCancelRef = useRef<(() => void) | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  // Refs spiegeln state — damit setAuthHooks immer auf aktuellen Wert zugreift.
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const applySession = useCallback((token: string, dto: AuthUserDto) => {
    const u = toAuthUser(dto);
    setAccessToken(token);
    setUser(u);
    if (u.tenantId) {
      setActiveTenantId(u.tenantId);
    }
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    accessTokenRef.current = null;
    if (refreshCancelRef.current) {
      refreshCancelRef.current();
      refreshCancelRef.current = null;
    }
  }, []);

  const refreshNow = useCallback(async (): Promise<string | null> => {
    try {
      const res = await authApi.refresh();
      applySession(res.access_token, res.user);
      return res.access_token;
    } catch {
      clearSession();
      return null;
    }
  }, [applySession, clearSession]);

  // Hooks für den API-Client setzen (Bearer + Auto-Refresh bei 401).
  useEffect(() => {
    setAuthHooks({
      getAccessToken: () => accessTokenRef.current,
      refresh: refreshNow,
      onUnauthorized: () => clearSession(),
    });
  }, [refreshNow, clearSession]);

  // Beim Mount: ZUERST M14-Cookie-Session prüfen (Discord/Notfall-Login),
  // dann als Fallback alten Refresh-Token-Flow versuchen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // M14: Cookie-basierte Session (Discord-OAuth oder Notfall-Login)
        const m14Session = await authApi.checkM14Session();
        if (cancelled) return;
        if (m14Session) {
          setUser(m14UserToAuthUser(m14Session));
          // M14-Sessions haben keinen access_token (Cookie-only)
          setAccessToken(null);
          return;
        }
        // Fallback: alter Refresh-Token-Flow (Bearer-basiert)
        const res = await authApi.refresh();
        if (cancelled) return;
        applySession(res.access_token, res.user);
      } catch {
        // Kein gültiger Session-Cookie und kein Refresh-Token → nicht eingeloggt.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  // Auto-Refresh-Timer planen, sobald accessToken sich ändert.
  useEffect(() => {
    if (refreshCancelRef.current) {
      refreshCancelRef.current();
      refreshCancelRef.current = null;
    }
    if (accessToken) {
      refreshCancelRef.current = scheduleRefresh(accessToken, async () => {
        await refreshNow();
      });
    }
    return () => {
      if (refreshCancelRef.current) {
        refreshCancelRef.current();
        refreshCancelRef.current = null;
      }
    };
  }, [accessToken, refreshNow]);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      applySession(res.access_token, res.user);
    },
    [applySession],
  );

  /**
   * Notfall-Login: ruft emergencyLogin auf (setzt Cookie), dann checkM14Session um User zu laden.
   */
  const loginWithEmergency = useCallback(
    async (email: string, password: string, totpCode: string, backupCode?: string) => {
      await authApi.emergencyLogin(email, password, totpCode, backupCode);
      const sessionUser = await authApi.checkM14Session();
      // M3: Session muss nach erfolgreichem Login verfügbar sein
      if (!sessionUser) {
        throw new Error('SESSION_LOAD_FAILED');
      }
      setUser(m14UserToAuthUser(sessionUser));
      setAccessToken(null);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Auch bei Fehler lokale Session beenden.
    }
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (!user) return false;
      return matchPermission(user.permissions, perm);
    },
    [user],
  );

  const updateLocalUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      loginWithPassword,
      loginWithEmergency,
      logout,
      refreshNow,
      hasPermission,
      updateLocalUser,
    }),
    [user, accessToken, isLoading, loginWithPassword, loginWithEmergency, logout, refreshNow, hasPermission, updateLocalUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider genutzt werden');
  return ctx;
}

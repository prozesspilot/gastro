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
import type { AuthUserDto } from '../api/auth';
import * as authApi from '../api/auth';
import { setAuthHooks, setActiveTenantId } from '../api/_client';
import { matchPermission } from './permissions';
import { scheduleRefresh } from './token-refresh';

export interface AuthUser extends AuthUserDto {
  // alias for display (legacy code)
  displayName: string;
  tenantId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
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

  // Beim Mount: Refresh-Cookie ausprobieren → Session wiederherstellen.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await authApi.refresh();
        if (cancelled) return;
        applySession(res.access_token, res.user);
      } catch {
        // Kein gültiger Refresh-Token → nicht eingeloggt.
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
      logout,
      refreshNow,
      hasPermission,
      updateLocalUser,
    }),
    [user, accessToken, isLoading, loginWithPassword, logout, refreshNow, hasPermission, updateLocalUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider genutzt werden');
  return ctx;
}

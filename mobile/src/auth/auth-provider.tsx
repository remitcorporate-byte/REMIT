import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, setAccessToken, setRefreshToken } from '@/src/api/client';
import type { Permission, User } from '@/src/types/api';


type Registration = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: Registration) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  can: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(async () => {
    setAccessToken(null);
    setUser(null);
    await setRefreshToken(null);
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        setUser(await api.restore());
      } catch {
        // Don't wipe the stored refresh token on a network error; a revoked or
        // expired session is already cleared inside refreshSession().
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();
  }, [clearSession]);

  const saveSession = useCallback(async (token: string, nextUser: User, refreshToken?: string) => {
    setAccessToken(token);
    setUser(nextUser);
    await setRefreshToken(refreshToken || null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.login(email.trim().toLowerCase(), password);
      await saveSession(session.accessToken || session.token || '', session.user, session.refreshToken);
    },
    [saveSession],
  );

  const register = useCallback(
    async (input: Registration) => {
      const session = await api.register({ ...input, email: input.email.trim().toLowerCase() });
      await saveSession(session.accessToken || session.token || '', session.user, session.refreshToken);
    },
    [saveSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      register,
      logout: async () => { await api.logout(); await clearSession(); },
      logoutAll: async () => { await api.logoutAll(); await clearSession(); },
      can: (permission) => Boolean(user?.permissions.includes(permission)),
    }),
    [clearSession, isLoading, login, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

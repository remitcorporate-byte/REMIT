import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, setAccessToken } from '@/src/api/client';
import type { Permission, User } from '@/src/types/api';

const TOKEN_KEY = 'remit.mobile.token';

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
  can: (permission: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(async () => {
    setAccessToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) return;
        setAccessToken(token);
        setUser(await api.me());
      } catch {
        await clearSession();
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();
  }, [clearSession]);

  const saveSession = useCallback(async (token: string, nextUser: User) => {
    setAccessToken(token);
    setUser(nextUser);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.login(email.trim().toLowerCase(), password);
      await saveSession(session.token, session.user);
    },
    [saveSession],
  );

  const register = useCallback(
    async (input: Registration) => {
      const session = await api.register({ ...input, email: input.email.trim().toLowerCase() });
      await saveSession(session.token, session.user);
    },
    [saveSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      register,
      logout: clearSession,
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

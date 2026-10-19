import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';

export interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: User | null;
  ready: boolean;
  setUser(u: User | null): void;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthState>({ user: null, ready: false, setUser: () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<{ user: User | null }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);
  const signOut = useCallback(async () => {
    await api('/api/auth/signout', { body: {} }).catch(() => {});
    setUser(null);
  }, []);
  return <Ctx.Provider value={{ user, ready, setUser, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

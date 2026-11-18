import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  clearSession,
  login,
  register,
  restoreSession,
  updateProfile,
} from "../services/auth";
import type { AuthSession } from "../services/auth";

type AuthValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (role: AuthSession["role"], identifier: string, password: string) => Promise<void>;
  register: (input: { role: "student" | "parent"; identifier: string; fullName: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: { name: string; email: string }) => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      login: async (role, identifier, password) => {
        const next = await login(role, identifier, password);
        setSession(next);
      },
      register: async (input) => {
        const next = await register(input);
        setSession(next);
      },
      logout: async () => {
        try {
          await clearSession();
        } finally {
          setSession(null);
        }
      },
      updateProfile: async (updates) => {
        const next = await updateProfile(updates);
        setSession(next);
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

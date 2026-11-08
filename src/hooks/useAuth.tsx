import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { clearSession, mockLogin, restoreSession } from "../services/auth";
import type { Role, Session } from "../types";

type AuthValue = {
  session: Session | null;
  login: (role: Role, identifier: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => restoreSession());
  const value = useMemo<AuthValue>(
    () => ({
      session,
      login: async (role, identifier, password) =>
        setSession(await mockLogin(role, identifier, password)),
      logout: () => {
        clearSession();
        setSession(null);
      },
    }),
    [session],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

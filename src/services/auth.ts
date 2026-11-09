import { demoAccounts } from "../data/mock";
import type { Role, Session } from "../types";

const SESSION_KEY = "mettamart-demo-session";

export async function mockLogin(
  role: Role,
  identifier: string,
  password: string,
): Promise<Session> {
  await new Promise((resolve) => setTimeout(resolve, 650));
  const account = demoAccounts[role];
  if (
    identifier.trim().toLowerCase() !== account.identifier.toLowerCase() ||
    password !== account.password
  ) {
    throw new Error("Kredensial tidak valid. Gunakan akun demo yang tersedia.");
  }
  const session = { role, name: account.name, email: account.identifier };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function restoreSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as Session | null;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

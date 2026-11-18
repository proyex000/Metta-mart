import {
  fetchCurrentSession,
  loginApi,
  logoutApi,
  registerApi,
  updateProfileApi,
  type AuthSession,
} from "./api";

export type { AuthSession };

export async function restoreSession(): Promise<AuthSession | null> {
  return fetchCurrentSession();
}

export async function login(
  role: AuthSession["role"],
  identifier: string,
  password: string,
): Promise<AuthSession> {
  return loginApi(role, identifier, password);
}

export async function register(input: {
  role: "student" | "parent";
  identifier: string;
  fullName: string;
  password: string;
}): Promise<AuthSession> {
  return registerApi(input);
}

export async function clearSession(): Promise<void> {
  await logoutApi();
}

export async function updateProfile(input: { name: string; email: string }): Promise<AuthSession> {
  return updateProfileApi(input);
}

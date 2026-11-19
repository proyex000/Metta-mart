type ApiUser = {
  id: number;
  identifier: string;
  full_name: string;
  email: string;
  role: "admin" | "student" | "parent";
};

export type AuthSession = {
  role: ApiUser["role"];
  name: string;
  email: string;
};

const API_BASE = ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

function toSession(user: ApiUser): AuthSession {
  return {
    role: user.role,
    name: user.full_name,
    email: user.email,
  };
}

async function csrfToken(): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/csrf/`, { credentials: "include" });
  if (!response.ok) throw new Error("Tidak dapat menyiapkan keamanan sesi. Periksa koneksi backend.");
  const data = (await response.json()) as { csrfToken?: string };
  if (!data.csrfToken) throw new Error("Token keamanan tidak diterima dari server.");
  return data.csrfToken;
}

// Ambil pesan error pertama dari respons DRF: {detail}, {field: ["pesan"]}, atau ["pesan"].
function firstErrorMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstErrorMessage(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    for (const key of Object.keys(record)) {
      const found = firstErrorMessage(record[key]);
      if (found) return found;
    }
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    headers.set("X-CSRFToken", await csrfToken());
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(firstErrorMessage(data) || "Permintaan ke server gagal.");
  }
  return data as T;
}

export async function fetchCurrentSession(): Promise<AuthSession | null> {
  const response = await fetch(`${API_BASE}/auth/me/`, { credentials: "include" });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Tidak dapat memeriksa sesi pengguna.");
  const data = (await response.json()) as { user: ApiUser };
  return toSession(data.user);
}

export async function loginApi(role: AuthSession["role"], identifier: string, password: string): Promise<AuthSession> {
  const data = await request<{ user: ApiUser }>("/auth/login/", {
    method: "POST",
    body: JSON.stringify({ identifier: identifier.trim(), password }),
  });
  if (data.user.role !== role) {
    await logoutApi();
    throw new Error("Akun ini tidak memiliki peran yang dipilih.");
  }
  return toSession(data.user);
}

export async function registerApi(input: {
  role: "student" | "parent";
  identifier: string;
  fullName: string;
  password: string;
}): Promise<AuthSession> {
  const data = await request<{ user: ApiUser }>("/auth/register/", {
    method: "POST",
    body: JSON.stringify({
      role: input.role,
      identifier: input.identifier.trim(),
      full_name: input.fullName.trim(),
      password: input.password,
    }),
  });
  return toSession(data.user);
}

export async function logoutApi(): Promise<void> {
  await request<void>("/auth/logout/", { method: "POST" });
}

export async function updateProfileApi(input: { name: string; email: string }): Promise<AuthSession> {
  const data = await request<{ user: ApiUser }>("/auth/me/", {
    method: "PATCH",
    body: JSON.stringify({ full_name: input.name.trim(), email: input.email.trim() }),
  });
  return toSession(data.user);
}


export const apiRequest = request;

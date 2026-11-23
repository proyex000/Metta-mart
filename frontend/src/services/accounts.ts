import { apiRequest } from "./api";

export type ManagedUser = {
  id: number;
  identifier: string;
  full_name: string;
  email: string;
  role: "admin" | "student" | "parent";
  is_active: boolean;
  date_joined: string;
};

export function fetchManagedUsers() {
  return apiRequest<ManagedUser[]>("/admin/users/");
}

export function createManagedUser(input: {
  identifier: string;
  full_name: string;
  email: string;
  role: ManagedUser["role"];
  password: string;
}) {
  return apiRequest<ManagedUser>("/admin/users/", {
    method: "POST",
    body: JSON.stringify({ ...input, is_active: true }),
  });
}

export function updateManagedUser(id: number, input: { identifier?: string; full_name?: string; is_active?: boolean }) {
  return apiRequest<ManagedUser>(`/admin/users/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

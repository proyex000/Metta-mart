import { apiRequest } from "./api";

export type LinkedStudent = { id: number; identifier: string; full_name: string };

export function fetchLinkedStudents() {
  return apiRequest<LinkedStudent[]>("/parent/children/");
}

export type AdminAccount = { id: number; identifier: string; full_name: string; email: string; role: "admin" | "student" | "parent"; is_active: boolean };
export type FamilyLink = { id: number; parent_id: number; parent_name: string; parent_identifier: string; student_id: number; student_name: string; student_identifier: string };

export function fetchAdminAccounts() {
  return apiRequest<AdminAccount[]>("/admin/users/");
}
export function fetchFamilyLinks() {
  return apiRequest<FamilyLink[]>("/admin/parent-student-links/");
}
export function createFamilyLink(parent_id: number, student_id: number) {
  return apiRequest<{ id: number; created: boolean }>("/admin/parent-student-links/", { method: "POST", body: JSON.stringify({ parent_id, student_id }) });
}
export function deleteFamilyLink(link_id: number) {
  return apiRequest<void>("/admin/parent-student-links/", { method: "DELETE", body: JSON.stringify({ link_id }) });
}

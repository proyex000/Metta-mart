import { apiRequest } from "./api";

export type LinkedStudent = { id: number; identifier: string; full_name: string };

export function fetchLinkedStudents() {
  return apiRequest<LinkedStudent[]>("/parent/children/");
}

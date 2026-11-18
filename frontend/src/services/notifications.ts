import { apiRequest } from "./api";

export type AppNotification = {
  id: number;
  title: string;
  message: string;
  kind: string;
  target_code: string;
  is_read: boolean;
  created_at: string;
};

export function fetchNotifications() {
  return apiRequest<AppNotification[]>("/notifications/");
}

export function markNotificationRead(id: number) {
  return apiRequest<{ id: number; is_read: boolean }>(`/notifications/${id}/read/`, { method: "POST", body: JSON.stringify({}) });
}

export function broadcastNotification(input: { title: string; message: string; kind?: string }) {
  return apiRequest<{ sent_to: number }>("/notifications/", { method: "POST", body: JSON.stringify(input) });
}

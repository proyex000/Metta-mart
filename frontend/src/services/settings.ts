import { apiRequest } from "./api";

export type StorefrontSettings = {
  operating_hours: { days: string[]; open_time: string; close_time: string };
  payment_methods: { cash: boolean; bank_transfer: boolean; qris: boolean };
  payment_instructions: { bank_name: string; account_name: string; account_number: string; qris_note: string };
  pickup_instructions: { message: string };
  store_profile: { name: string; description: string; address: string; email: string; phone: string };
  notification_preferences: { order_alerts: boolean; low_stock_alerts: boolean; announcements_enabled: boolean };
};
export function fetchStorefrontSettings() {
  return apiRequest<StorefrontSettings>("/storefront/settings/");
}
export function updateStorefrontSettings(settings: Partial<StorefrontSettings>) {
  return apiRequest<StorefrontSettings>("/storefront/settings/", { method: "PATCH", body: JSON.stringify(settings) });
}

import { apiRequest } from "./api";

export type ApiProduct = {
  id: number; name: string; sku: string | null; barcode: string | null; category_slug: string;
  category_name: string; description: string; unit: string; price: number; cost_price: number;
  stock: number; min_stock: number; image_url: string; is_active: boolean;
};

export type ApiOrderItem = { id: number; product: number | null; product_name: string; sku: string; unit: string; unit_price: number; quantity: number; line_total: number };
export type ApiPayment = { method: "cash" | "bank_transfer" | "qris"; status: string; amount: number; cash_received: number | null; change_due: number; reference: string; payment_reference: string; paid_at: string | null; verified_by_name: string | null; verification_note: string };
export type ApiOrder = {
  id: number; code: string; customer: number | null; customer_name: string; customer_identifier: string; created_by_name?: string | null;
  status: string; fulfillment: "pickup"; delivery_address: string; customer_note: string;
  admin_note: string; subtotal: number; delivery_fee: number; total: number; expires_at: string | null;
  items: ApiOrderItem[]; payment: ApiPayment; status_history: { from_status: string; to_status: string; note: string; actor_name: string | null; created_at: string }[];
  created_at: string; updated_at: string;
};
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export async function listProducts(params: { search?: string; category?: string; lowStock?: boolean; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.category) query.set("category", params.category);
  if (params.lowStock) query.set("low_stock", "true");
  if (params.page && params.page > 1) query.set("page", String(params.page));
  return apiRequest<Page<ApiProduct> | ApiProduct[]>(`/products/${query.size ? `?${query.toString()}` : ""}`);
}

export async function createProduct(input: Partial<ApiProduct> & Pick<ApiProduct, "name" | "category_slug" | "price">) {
  return apiRequest<ApiProduct>("/products/", { method: "POST", body: JSON.stringify(input) });
}
export async function updateProduct(id: number, input: Partial<ApiProduct>) {
  return apiRequest<ApiProduct>(`/products/${id}/`, { method: "PATCH", body: JSON.stringify(input) });
}
export async function deleteProduct(id: number) {
  return apiRequest<void>(`/products/${id}/`, { method: "DELETE" });
}
export async function adjustStock(id: number, quantityDelta: number, note: string) {
  return apiRequest<ApiProduct>(`/products/${id}/stock-adjustments/`, { method: "POST", body: JSON.stringify({ quantity_delta: quantityDelta, note }) });
}
export async function setStock(id: number, targetStock: number, expectedStock: number, note: string) {
  return apiRequest<ApiProduct>(`/products/${id}/stock-adjustments/`, { method: "POST", body: JSON.stringify({ target_stock: targetStock, expected_stock: expectedStock, note }) });
}
export async function listOrders(statusFilter?: string, page = 1) {
  const query = new URLSearchParams();
  if (statusFilter) query.set("status", statusFilter);
  if (page > 1) query.set("page", String(page));
  return apiRequest<Page<ApiOrder> | ApiOrder[]>(`/orders/${query.size ? `?${query.toString()}` : ""}`);
}
export async function getOrder(code: string) {
  return apiRequest<ApiOrder>(`/orders/${encodeURIComponent(code)}/`);
}
export async function createCheckout(input: { items: { product_id: number; quantity: number }[]; fulfillment: "pickup"; customer_note?: string; payment_method: "cash" | "bank_transfer" | "qris" }) {
  return apiRequest<ApiOrder>("/orders/checkout/", { method: "POST", body: JSON.stringify(input) });
}
export async function orderAction(code: string, action: string, note = "") {
  return apiRequest<ApiOrder>(`/orders/${encodeURIComponent(code)}/actions/`, { method: "POST", body: JSON.stringify({ action, note }) });
}

export function pageResults<T>(value: Page<T> | T[]): T[] {
  return Array.isArray(value) ? value : value.results;
}

export type CheckoutConfig = { cash_enabled: boolean; bank_transfer_enabled: boolean; bank_name: string; bank_account_name: string; bank_account_number: string; qris_enabled: boolean; qris_image_url: string; pickup_enabled: boolean; operating_days: string[]; opening_time: string; closing_time: string; pickup_instructions: string };
export async function getCheckoutConfig() {
  return apiRequest<CheckoutConfig>("/store/checkout-config/");
}
export async function updateCheckoutConfig(input: Partial<CheckoutConfig>) {
  return apiRequest<CheckoutConfig>("/admin/checkout-config/", { method: "PATCH", body: JSON.stringify(input) });
}

export type CashierShift = {
  id: number; status: "open" | "closed"; opening_cash: number; expected_cash: number;
  cash_sales: number; cash_in: number; cash_out: number; opened_at: string; closed_at: string | null;
  closing_cash: number | null; opening_note: string; closing_note: string;
  cash_movements: { id: number; kind: "cash_in" | "cash_out"; amount: number; note: string; created_at: string }[];
};
export async function getCurrentShift() {
  return apiRequest<{ shift: CashierShift | null }>("/pos/shifts/current/");
}
export async function openShift(openingCash: number, note = "") {
  return apiRequest<CashierShift>("/pos/shifts/open/", { method: "POST", body: JSON.stringify({ opening_cash: openingCash, note }) });
}
export async function closeShift(closingCash: number, note = "") {
  return apiRequest<CashierShift & { variance: number }>("/pos/shifts/close/", { method: "POST", body: JSON.stringify({ closing_cash: closingCash, note }) });
}
export async function createCashMovement(kind: "cash_in" | "cash_out", amount: number, note: string) {
  return apiRequest<{ id: number; kind: string; amount: number; note: string; created_at: string }>("/pos/shifts/movements/", { method: "POST", body: JSON.stringify({ kind, amount, note }) });
}
export async function posCheckout(input: { items: { product_id: number; quantity: number }[]; customer_note?: string; cash_received: number }) {
  return apiRequest<ApiOrder>("/pos/checkout/", { method: "POST", body: JSON.stringify(input) });
}

export type ApiStockMovement = { id: number; product: number; product_name: string; kind: string; quantity_delta: number; stock_after: number; reference: string; note: string; actor_name: string | null; created_at: string };
export async function listStockMovements(productId?: number, page = 1) {
  const query = new URLSearchParams();
  if (productId) query.set("product", String(productId));
  if (page > 1) query.set("page", String(page));
  return apiRequest<Page<ApiStockMovement> | ApiStockMovement[]>(`/admin/stock-movements/${query.size ? `?${query.toString()}` : ""}`);
}

export type ApiNotification = { id: number; kind: string; title: string; body: string; target_url: string; read_at: string | null; created_at: string };
export async function listNotifications(page = 1) {
  return apiRequest<Page<ApiNotification> | ApiNotification[]>("/notifications/" + (page > 1 ? "?page=" + page : ""));
}
export async function getUnreadNotificationCount() {
  return apiRequest<{ count: number }>("/notifications/unread-count/");
}
export async function markNotificationRead(id: number) {
  return apiRequest<ApiNotification>("/notifications/" + id + "/read/", { method: "POST" });
}
export async function markAllNotificationsRead() {
  return apiRequest<{ updated: number }>("/notifications/read-all/", { method: "POST" });
}

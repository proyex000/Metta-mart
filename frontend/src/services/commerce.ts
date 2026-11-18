import { apiRequest } from "./api";

export type ApiProduct = {
  id: number; name: string; sku: string | null; barcode: string | null; category_slug: string;
  category_name: string; description: string; unit: string; price: number; cost_price: number;
  stock: number; min_stock: number; image_url: string; is_active: boolean;
};

export type ApiOrderItem = { id: number; product: number | null; product_name: string; sku: string; unit: string; unit_price: number; quantity: number; line_total: number };
export type ApiPayment = { method: "cash" | "qris"; status: string; amount: number; reference: string; paid_at: string | null; verified_by_name: string | null; verification_note: string };
export type ApiOrder = {
  id: number; code: string; customer: number; customer_name: string; customer_identifier: string;
  status: string; fulfillment: "pickup" | "delivery"; delivery_address: string; customer_note: string;
  admin_note: string; subtotal: number; delivery_fee: number; total: number; expires_at: string | null;
  items: ApiOrderItem[]; payment: ApiPayment; status_history: { from_status: string; to_status: string; note: string; actor_name: string | null; created_at: string }[];
  created_at: string; updated_at: string;
};
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export async function listProducts(params: { search?: string; category?: string; lowStock?: boolean } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.category) query.set("category", params.category);
  if (params.lowStock) query.set("low_stock", "true");
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
export async function listOrders(statusFilter?: string) {
  const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
  return apiRequest<Page<ApiOrder> | ApiOrder[]>(`/orders/${query}`);
}
export async function getOrder(code: string) {
  return apiRequest<ApiOrder>(`/orders/${encodeURIComponent(code)}/`);
}
export async function createCheckout(input: { items: { product_id: number; quantity: number }[]; fulfillment: "pickup" | "delivery"; delivery_address?: string; customer_note?: string; payment_method: "cash" | "qris" }) {
  return apiRequest<ApiOrder>("/orders/checkout/", { method: "POST", body: JSON.stringify(input) });
}
export async function orderAction(code: string, action: string, note = "") {
  return apiRequest<ApiOrder>(`/orders/${encodeURIComponent(code)}/actions/`, { method: "POST", body: JSON.stringify({ action, note }) });
}

export function pageResults<T>(value: Page<T> | T[]): T[] {
  return Array.isArray(value) ? value : value.results;
}

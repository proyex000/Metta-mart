import { apiRequest } from "./api";

export type CommerceOrderItem = {
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
};
export type CommerceOrder = {
  id: number;
  code: string;
  customer_name: string;
  status: "pending" | "accepted" | "ready_for_pickup" | "completed" | "cancelled";
  payment_method: "cash" | "bank_transfer" | "qris";
  payment_status: "unpaid" | "pending_verification" | "paid" | "failed" | "refunded";
  note: string;
  subtotal: number;
  total: number;
  items: CommerceOrderItem[];
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};
export type PaymentMethod = CommerceOrder["payment_method"];

export function createOrder(input: { items: { product_id: number; quantity: number }[]; payment_method: PaymentMethod; note?: string }) {
  return apiRequest<CommerceOrder>("/orders/", { method: "POST", body: JSON.stringify(input) });
}
export function fetchOrders() {
  return apiRequest<CommerceOrder[]>("/orders/");
}
export function fetchOrder(code: string) {
  return apiRequest<CommerceOrder>(`/orders/${encodeURIComponent(code)}/`);
}
export function submitPayment(code: string, note: string) {
  return apiRequest<CommerceOrder>(`/orders/${encodeURIComponent(code)}/payment-submission/`, { method: "POST", body: JSON.stringify({ note }) });
}
export function adminOrderAction(code: string, action: "accept" | "ready" | "complete-pickup" | "cancel") {
  return apiRequest<CommerceOrder>(`/admin/orders/${encodeURIComponent(code)}/${action}/`, { method: "POST", body: JSON.stringify({}) });
}
export function adminPaymentAction(code: string, action: "verify" | "reject", note = "") {
  return apiRequest<CommerceOrder>(`/admin/orders/${encodeURIComponent(code)}/payment/${action}/`, { method: "POST", body: JSON.stringify({ note }) });
}

export type AdminSalesReport = {
  period: { from: string; to: string };
  today: { revenue: number; orders: number };
  month: { revenue: number; orders: number; average_order: number };
  daily: { date: string; total: number; orders: number }[];
  top_products: { product_name: string; quantity: number; revenue: number }[];
};

export function fetchAdminSalesReport() {
  return apiRequest<AdminSalesReport>("/admin/reports/summary/");
}

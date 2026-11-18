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
  beneficiary_name: string | null;
  status: "pending" | "accepted" | "ready_for_pickup" | "completed" | "cancelled";
  payment_method: "cash" | "bank_transfer" | "qris";
  payment_status: "unpaid" | "pending_verification" | "paid" | "failed" | "refunded";
  payment_sender_name: string;
  payment_source: string;
  payment_account_last4: string;
  note: string;
  subtotal: number;
  total: number;
  cash_received: number | null;
  change_due: number | null;
  sales_channel: "online" | "pos";
  items: CommerceOrderItem[];
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
};
export type PaymentMethod = CommerceOrder["payment_method"];

export function createOrder(input: { items: { product_id: number; quantity: number }[]; payment_method: PaymentMethod; note?: string; student_id?: number }) {
  return apiRequest<CommerceOrder>("/orders/", { method: "POST", body: JSON.stringify(input) });
}
export function fetchOrders() {
  return apiRequest<CommerceOrder[]>("/orders/");
}
export function fetchOrder(code: string) {
  return apiRequest<CommerceOrder>(`/orders/${encodeURIComponent(code)}/`);
}
export function submitPayment(code: string, input: { sender_name: string; payment_source: string; account_last4?: string; note?: string }) {
  return apiRequest<CommerceOrder>(`/orders/${encodeURIComponent(code)}/payment-submission/`, { method: "POST", body: JSON.stringify(input) });
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

export type AdminDashboardSummary = {
  products: number;
  orders_pending: number;
  orders_processing: number;
  orders_ready: number;
  customers: number;
  low_stock: { id: number; name: string; stock: number }[];
  today_revenue: number;
  daily: { date: string; revenue: number; orders: number }[];
  recent_orders: {
    code: string;
    customer_name: string;
    beneficiary_name: string | null;
    sales_channel: "online" | "pos";
    total: number;
    status: CommerceOrder["status"];
    payment_status: CommerceOrder["payment_status"];
    created_at: string;
  }[];
};

export function fetchAdminDashboard() {
  return apiRequest<AdminDashboardSummary>("/admin/dashboard/");
}

export function createPOSOrder(input: { items: { product_id: number; quantity: number }[]; payment_method: PaymentMethod; note?: string; cash_received?: number }) {
  return apiRequest<CommerceOrder>("/admin/pos/checkout/", { method: "POST", body: JSON.stringify(input) });
}

export type InventoryMovementRow = {
  id: number;
  product: number;
  product_name: string;
  actor: number | null;
  actor_name: string | null;
  quantity_delta: number;
  reason: "initial_stock" | "manual_adjustment" | "order_reserved" | "order_cancelled" | "pos_sale";
  reference: string;
  created_at: string;
};

export function fetchInventoryMovements() {
  return apiRequest<InventoryMovementRow[]>("/admin/inventory-movements/");
}

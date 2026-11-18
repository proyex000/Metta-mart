import { useCallback, useEffect, useMemo, useState } from "react";
import { getOrder, listOrders, orderAction, pageResults } from "../../services/commerce";
import type { ApiOrder } from "../../services/commerce";

const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const statusLabels: Record<string, string> = {
  awaiting_payment: "Menunggu pembayaran", pending_review: "Menunggu konfirmasi", accepted: "Diterima",
  processing: "Diproses", ready: "Siap diambil",
  completed: "Selesai", rejected: "Ditolak", cancelled: "Dibatalkan", expired: "Kedaluwarsa",
};
const paymentLabels: Record<string, string> = {
  unpaid: "Belum dibayar", pending_verification: "Menunggu verifikasi", paid: "Lunas",
  failed: "Gagal", expired: "Kedaluwarsa", refund_pending: "Menunggu pengembalian dana", refunded: "Dikembalikan",
};
const tabs = [
  { label: "Semua", value: "" }, { label: "Pembayaran", value: "awaiting_payment" },
  { label: "Perlu konfirmasi", value: "pending_review" }, { label: "Diterima", value: "accepted" },
  { label: "Diproses", value: "processing" }, { label: "Siap diambil", value: "ready" },
  { label: "Selesai", value: "completed" },
];

export function Orders() {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ApiOrder | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await listOrders(statusFilter || undefined, page);
      setOrders(pageResults(response));
      setCount(Array.isArray(response) ? response.length : response.count);
      setHasNext(!Array.isArray(response) && Boolean(response.next));
      setHasPrevious(!Array.isArray(response) && Boolean(response.previous));
      if (selected) {
        try { setSelected(await getOrder(selected.code)); } catch { setSelected(null); }
      }
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Daftar pesanan gagal dimuat.");
    } finally { setLoading(false); }
  }, [statusFilter, selected?.code, page]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => !needle || order.code.toLowerCase().includes(needle) || order.customer_name.toLowerCase().includes(needle) || order.customer_identifier.toLowerCase().includes(needle));
  }, [orders, query]);

  const runAction = async (action: string) => {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const updated = await orderAction(selected.code, action, note.trim());
      setSelected(updated); setNote("");
      const response = await listOrders(statusFilter || undefined, page);
      setOrders(pageResults(response));
      setCount(Array.isArray(response) ? response.length : response.count);
      setHasNext(!Array.isArray(response) && Boolean(response.next));
      setHasPrevious(!Array.isArray(response) && Boolean(response.previous));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aksi pesanan gagal diproses.");
    } finally { setBusy(false); }
  };

  const actions = selected ? [
    ...(selected.status === "awaiting_payment" && ["qris", "bank_transfer"].includes(selected.payment.method) && selected.payment.status === "pending_verification" ? [{ id: "verify_payment", label: "Verifikasi Pembayaran", style: "primary" }] : []),
    ...(selected.status === "awaiting_payment" && selected.payment.method === "bank_transfer" && selected.payment.status === "pending_verification" ? [{ id: "reject_payment", label: "Tolak Referensi Transfer", style: "danger" }] : []),
    ...(selected.payment.status === "refund_pending" ? [{ id: "mark_refunded", label: "Catat Refund Selesai", style: "primary" }] : []),
    ...(selected.status === "pending_review" ? [{ id: "accept", label: "Terima Pesanan", style: "primary" }, { id: "reject", label: "Tolak Pesanan", style: "danger" }] : []),
    ...(selected.status === "accepted" ? [{ id: "start_processing", label: "Mulai Diproses", style: "primary" }] : []),
    ...(selected.status === "processing" ? [{ id: "mark_ready", label: "Tandai Siap", style: "primary" }] : []),
    ...(selected.status === "ready" && selected.fulfillment === "pickup" ? [{ id: "complete", label: "Konfirmasi Pengambilan", style: "primary" }] : []),
  ] : [];

  return <>
    <header className="topbar"><div><h1>Pesanan</h1><p>Terima, tolak, verifikasi pembayaran, dan pantau proses pesanan.</p></div><button className="secondary-btn" onClick={() => void refresh()}>Muat ulang</button></header>
    <div className="panel table-panel">
      <div className="tabs">{tabs.map((tab) => <button key={tab.value || "all"} className={statusFilter === tab.value ? "active" : ""} onClick={() => { setPage(1); setStatusFilter(tab.value); }}>{tab.label}</button>)}</div>
      <label className="search order-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode pesanan / nama / identitas pelanggan..." /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {loading ? <p className="empty-state">Memuat pesanan dari server...</p> : shown.length ? <div className="desktop-table"><table><thead><tr><th>No</th><th>Kode Pesanan</th><th>Tanggal</th><th>Pelanggan</th><th>Pengambilan</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{shown.map((order, index) => <tr key={order.code}><td>{index + 1}</td><td><b>{order.code}</b></td><td>{dateTime(order.created_at)}</td><td>{order.customer_name}<small className="table-subtext">{order.customer_identifier}</small></td><td>Ambil di koperasi</td><td><b>{money(order.total)}</b></td><td><span className="status status--amber">{statusLabels[order.status] || order.status}</span></td><td><button className="primary small" onClick={() => { setSelected(order); setNote(""); }}>Detail</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><h2>Belum ada pesanan</h2><p>Pesanan baru akan muncul di sini setelah pelanggan checkout.</p></div>}
      <p className="table-foot">Menampilkan {shown.length} pesanan pada halaman ini · Total cocok: {count}</p>
      <div className="pagination-controls"><button className="secondary-btn" disabled={!hasPrevious} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</button><span>Halaman {page}</span><button className="secondary-btn" disabled={!hasNext} onClick={() => setPage((value) => value + 1)}>Selanjutnya</button></div>
    </div>
    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" onMouseDown={(event) => event.stopPropagation()}><div className="panel__title"><h2 id="order-detail-title">Detail {selected.code}</h2><button type="button" onClick={() => setSelected(null)}>×</button></div>
      <div className="admin-order-detail"><p><span>Pelanggan</span><b>{selected.customer_name} · {selected.customer_identifier}</b></p><p><span>Dibuat</span><b>{dateTime(selected.created_at)}</b></p><p><span>Status pesanan</span><b>{statusLabels[selected.status] || selected.status}</b></p><p><span>Status pembayaran</span><b>{paymentLabels[selected.payment.status] || selected.payment.status} · {selected.payment.method.toUpperCase()}</b></p>{selected.payment.payment_reference && <p><span>Referensi transfer pelanggan</span><b>{selected.payment.payment_reference}</b></p>}{selected.payment.verification_note && <p><span>Catatan verifikasi</span><b>{selected.payment.verification_note}</b></p>}<p><span>Total</span><b>{money(selected.total)}</b></p><p><span>Pengambilan</span><b>Ambil di koperasi</b></p>{selected.customer_note && <p><span>Catatan pelanggan</span><b>{selected.customer_note}</b></p>}
      <h3>Barang dipesan</h3>{selected.items.map((item) => <p key={item.id}><span>{item.product_name} × {item.quantity}</span><b>{money(item.line_total)}</b></p>)}
      <h3>Riwayat status</h3><ol className="order-history">{selected.status_history.map((entry, index) => <li key={index}><b>{statusLabels[entry.to_status] || entry.to_status}</b><small>{dateTime(entry.created_at)} · {entry.actor_name || "Sistem"}</small>{entry.note && <span>{entry.note}</span>}</li>)}</ol>
      {actions.length > 0 && <><label className="order-action-note">Catatan internal / alasan (opsional)<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tulis alasan penolakan atau catatan verifikasi..." /></label><div className="order-action-buttons">{actions.map((action) => <button key={action.id} disabled={busy} className={action.style === "danger" ? "danger-btn" : "primary"} onClick={() => void runAction(action.id)}>{busy ? "Memproses..." : action.label}</button>)}</div></>}
      {selected.payment.status === "refund_pending" && <p className="payment-help" role="status">Pengembalian dana transfer/QRIS perlu dilakukan dan dicatat secara manual di luar aplikasi.</p>}
      <button className="secondary-btn wide" onClick={() => setSelected(null)}>Tutup Detail</button></div>
    </section></div>}
  </>;
}

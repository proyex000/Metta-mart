import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PageTitle, Status } from "../../components/ui";
import { listOrders, listProducts, pageResults, type ApiOrder } from "../../services/commerce";

const money = (value: number) => "Rp " + value.toLocaleString("id-ID");
const labels: Record<string, string> = { awaiting_payment: "Menunggu pembayaran", pending_review: "Menunggu konfirmasi", accepted: "Diterima", processing: "Diproses", ready: "Siap diambil", out_for_delivery: "Dalam pengiriman", completed: "Selesai", rejected: "Ditolak", cancelled: "Dibatalkan", expired: "Kedaluwarsa" };
const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function Dashboard() {
  const [productsCount, setProductsCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recent, setRecent] = useState<ApiOrder[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [products, orders, awaiting, review, accepted, processing, ready, delivery, lowStock] = await Promise.all([
          listProducts(), listOrders(), listOrders("awaiting_payment"), listOrders("pending_review"),
          listOrders("accepted"), listOrders("processing"), listOrders("ready"), listOrders("out_for_delivery"),
          listProducts({ lowStock: true }),
        ]);
        if (!active) return;
        setProductsCount(Array.isArray(products) ? products.length : products.count);
        setOrdersCount(Array.isArray(orders) ? orders.length : orders.count);
        setPendingCount((Array.isArray(awaiting) ? awaiting.length : awaiting.count) + (Array.isArray(review) ? review.length : review.count));
        setActiveCount([accepted, processing, ready, delivery].reduce((sum, value) => sum + (Array.isArray(value) ? value.length : value.count), 0));
        setLowStockCount(Array.isArray(lowStock) ? lowStock.length : lowStock.count);
        setRecent(pageResults(orders).slice(0, 6));
        setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Data dashboard gagal dimuat.");
      } finally { if (active) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const stats = [
    { label: "Produk Aktif", value: productsCount, note: "Dari katalog backend" },
    { label: "Total Pesanan", value: ordersCount, note: "Seluruh status pesanan" },
    { label: "Perlu Tindakan", value: pendingCount, note: "Pembayaran / konfirmasi" },
    { label: "Sedang Diproses", value: activeCount, note: "Diterima sampai dikirim" },
  ];
  return <>
    <PageTitle title="Dashboard Admin" subtitle="Ringkasan operasional dari data server." />
    {error && <p className="auth-error" role="alert">{error}</p>}
    <section className="stat-grid">{stats.map((item) => <article className="stat-card" key={item.label}><span>{item.label === "Produk Aktif" ? "▦" : item.label === "Total Pesanan" ? "▣" : item.label === "Perlu Tindakan" ? "!" : "↗"}</span><div><small>{item.label}</small><strong>{loading ? "…" : item.value.toLocaleString("id-ID")}</strong><em>{item.note}</em></div></article>)}</section>
    <section className="dashboard-grid">
      <article className="panel">
        <div className="panel__title"><h2>Pesanan Terbaru</h2><Link to="/admin/orders">Buka antrean pesanan ›</Link></div>
        {recent.length ? <div className="desktop-table"><table><thead><tr><th>Kode</th><th>Pelanggan</th><th>Waktu</th><th>Total</th><th>Status</th></tr></thead><tbody>{recent.map((order) => <tr key={order.code}><td><b>{order.code}</b></td><td>{order.customer_name}</td><td>{dateTime(order.created_at)}</td><td>{money(order.total)}</td><td><Status>{labels[order.status] || order.status}</Status></td></tr>)}</tbody></table></div> : <div className="empty-state">{loading ? "Memuat data..." : "Belum ada transaksi pesanan."}</div>}
      </article>
      <article className="panel">
        <div className="panel__title"><h2>Perhatian Stok</h2><Link to="/admin/stock">Kelola stok ›</Link></div>
        <strong className="dashboard-alert-number">{loading ? "…" : lowStockCount}</strong>
        <p>Produk dengan stok sama dengan atau di bawah batas minimum.</p>
        {lowStockCount > 0 && <p className="payment-help">Periksa dan catat barang masuk sebelum menerima pesanan tambahan.</p>}
      </article>
    </section>
  </>;
}

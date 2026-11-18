import { useEffect, useState } from "react";
import { PageTitle } from "../../components/ui";
import { apiRequest } from "../../services/api";

type SalesReport = {
  from: string; to: string; total_sales: number; orders_count: number; average_order: number;
  daily_sales: { date: string; sales: number; orders: number }[];
  category_sales: { category: string; sales: number; quantity: number }[];
  top_products: { product_name: string; sales: number; quantity: number }[];
  payment_methods: { method: string; sales: number; orders: number }[];
};
const money = (value: number) => "Rp " + value.toLocaleString("id-ID");
const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
};
const today = localDate(new Date());
const weekAgo = localDate(new Date(Date.now() - 6 * 86400000));

export function Reports() {
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<SalesReport>("/admin/reports/sales/?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to))
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Laporan gagal dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, reload]);

  const maxDaily = Math.max(1, ...(data?.daily_sales.map((item) => item.sales) || [0]));
  return <>
    <PageTitle title="Laporan Penjualan" subtitle="Ringkasan transaksi yang sudah selesai dan pembayarannya lunas." />
    <section className="panel report-filter">
      <label>Dari tanggal<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Sampai tanggal<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
      <button className="secondary-btn" disabled={loading} onClick={() => setReload((value) => value + 1)}>Muat ulang</button>
    </section>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {loading && !data ? <div className="panel empty-state">Memuat laporan dari server...</div> : data && <>
      <section className="stat-grid report-stat-grid">
        <article className="stat-card"><span>Rp</span><div><small>Total Penjualan</small><strong>{money(data.total_sales)}</strong><em>Transaksi lunas dan selesai</em></div></article>
        <article className="stat-card"><span>#</span><div><small>Jumlah Pesanan</small><strong>{data.orders_count.toLocaleString("id-ID")}</strong><em>Pada periode terpilih</em></div></article>
        <article className="stat-card"><span>∅</span><div><small>Rata-rata Transaksi</small><strong>{money(data.average_order)}</strong><em>Nilai rata-rata per pesanan</em></div></article>
      </section>
      <section className="panel report-real-panel">
        <div className="panel__title"><h2>Penjualan Harian</h2><small>{data.from} — {data.to}</small></div>
        {data.daily_sales.length ? <div className="report-bars">{data.daily_sales.map((item) => <div className="report-bar-column" key={item.date} title={money(item.sales) + " · " + item.orders + " pesanan"}><strong>{money(item.sales)}</strong><i style={{ height: Math.max(4, item.sales / maxDaily * 100) + "%" }} /><small>{new Date(item.date + "T12:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}</small></div>)}</div> : <p className="empty-state">Belum ada penjualan selesai pada periode ini.</p>}
      </section>
      <section className="report-real-grid">
        <article className="panel"><div className="panel__title"><h2>Penjualan per Kategori</h2></div>{data.category_sales.length ? <div className="report-data-list">{data.category_sales.map((item) => <div key={item.category}><span>{item.category}<small>{item.quantity} unit terjual</small></span><b>{money(item.sales)}</b></div>)}</div> : <p className="empty-state">Belum ada data kategori.</p>}</article>
        <article className="panel"><div className="panel__title"><h2>Metode Pembayaran</h2></div>{data.payment_methods.length ? <div className="report-data-list">{data.payment_methods.map((item) => <div key={item.method}><span>{item.method === "qris" ? "QRIS" : "Tunai"}<small>{item.orders} transaksi</small></span><b>{money(item.sales)}</b></div>)}</div> : <p className="empty-state">Belum ada data pembayaran.</p>}</article>
      </section>
      <section className="panel report-real-panel"><div className="panel__title"><h2>Produk Terlaris</h2></div>{data.top_products.length ? <div className="report-data-list">{data.top_products.map((item) => <div key={item.product_name}><span>{item.product_name}<small>{item.quantity} unit terjual</small></span><b>{money(item.sales)}</b></div>)}</div> : <p className="empty-state">Belum ada produk terjual.</p>}</section>
    </>}
  </>;
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Icon, PageTitle, ProductArt, Status } from "../../components/ui";
import { ALL_CATEGORIES, categories, categoryLabel, isCategoryId, type CategoryId } from "../../data/categories";
import { useProducts, stockLabel } from "../../services/products";
import { useAuth } from "../../hooks/useAuth";
import { apiRequest } from "../../services/api";
import { createCheckout, getOrder, listOrders, orderAction, pageResults, submitPaymentReference, type ApiOrder, type CheckoutConfig } from "../../services/commerce";
import type { Role } from "../../types";

const money = (value: number) => "Rp " + value.toLocaleString("id-ID");
const formatDate = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const labels: Record<string, string> = { awaiting_payment: "Menunggu pembayaran", pending_review: "Menunggu konfirmasi", accepted: "Diterima", processing: "Diproses", ready: "Siap diambil", completed: "Selesai", rejected: "Ditolak", cancelled: "Dibatalkan", expired: "Kedaluwarsa" };
const defaultConfig: CheckoutConfig = { cash_enabled: true, bank_transfer_enabled: false, bank_name: "", bank_account_name: "", bank_account_number: "", qris_enabled: false, qris_image_url: "", pickup_enabled: true, operating_days: [], opening_time: "", closing_time: "", pickup_instructions: "" };


export function ShopDashboard({ role }: { role: Exclude<Role, "admin"> }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const products = useProducts();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const base = "/" + role;
  useEffect(() => {
    let active = true;
    listOrders().then((response) => { if (active) setOrders(pageResults(response)); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return <>
    <PageTitle title={"Halo, " + (session?.name || "Pengguna")} subtitle={role === "parent" ? "Lihat katalog dan pantau pesanan akun Anda." : "Temukan kebutuhan sekolah yang tersedia di koperasi."} />
    <label className="search shop-search"><Icon name="search" /><input placeholder="Cari barang, buku, atau kebutuhan sekolah..." onFocus={() => navigate(base + "/stock")} /></label>
    <div className="section-heading"><h2>Kategori</h2><Link to={base + "/stock"}>Lihat Semua ›</Link></div>
    <section className="category-grid">{categories.map((item) => <Link to={base + "/stock?category=" + item.id} key={item.id}><span><Icon name={item.icon} /></span>{item.label}</Link>)}</section>
    <div className="section-heading"><h2>{role === "parent" ? "Pesanan Terbaru" : "Stok Tersedia"}</h2><Link to={role === "parent" ? base + "/orders" : base + "/stock"}>Lihat Semua ›</Link></div>
    {role === "parent" ? <section className="shop-orders shop-dashboard-orders">{orders.slice(0, 3).map((order) => <article key={order.code}><div><b>#{order.code}</b><Status>{labels[order.status] || order.status}</Status></div><small>{formatDate(order.created_at)}</small><footer><span>Total <strong>{money(order.total)}</strong></span><Link to={base + "/orders/" + order.code}>Lihat Detail ›</Link></footer></article>)}{!orders.length && <div className="empty-state"><p>Belum ada pesanan pada akun ini.</p></div>}</section> : <section className="product-strip shop-strip">{products.slice(0, 3).map((product) => <article key={product.id}><ProductArt type={product.art} /><b>{product.name}</b><span>{money(product.price)}</span><Status>{stockLabel(product.stock)}</Status><Link to={base + "/order?product=" + product.id}>Pesan</Link></article>)}{!products.length && <div className="empty-state"><p>Katalog belum memiliki produk aktif.</p></div>}</section>}
    <section className="shop-promo"><Icon name="bag" size={28} /><div><b>MettaMart</b><p>Pesan kebutuhan sekolah dan pantau statusnya melalui akun Anda.</p></div></section>
  </>;
}

export function ShopStock({ role }: { role: Exclude<Role, "admin"> }) {
  const products = useProducts();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const requested = params.get("category");
  const category: CategoryId | typeof ALL_CATEGORIES = isCategoryId(requested) ? requested : ALL_CATEGORIES;
  const list = useMemo(() => products.filter((product) => {
    const needle = query.trim().toLowerCase();
    return (!needle || product.name.toLowerCase().includes(needle) || categoryLabel(product.category).toLowerCase().includes(needle)) && (category === ALL_CATEGORIES || product.category === category);
  }), [products, query, category]);
  return <>
    <PageTitle title="Stok Barang" subtitle="Katalog dan ketersediaan barang dari data toko." />
    <label className="search shop-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari produk..." /></label>
    <div className="tabs shop-tabs">{[{ id: ALL_CATEGORIES, label: "Semua" }, ...categories].map((item) => <button key={item.id} className={category === item.id ? "active" : ""} onClick={() => setParams(item.id === ALL_CATEGORIES ? {} : { category: item.id }, { replace: true })}>{item.label}</button>)}</div>
    <section className="shop-product-grid">{list.map((product) => <article key={product.id}><ProductArt type={product.art} /><div><b>{product.name}</b><span>{money(product.price)}</span><small>{categoryLabel(product.category)} · Stok: {product.stock}</small></div><Status>{stockLabel(product.stock)}</Status><Link className={product.stock === 0 ? "disabled" : ""} to={product.stock ? "/" + role + "/order?product=" + product.id : "#"}>Pesan</Link></article>)}</section>
    {!list.length && <div className="empty-state"><Icon name="search" size={34} /><h2>Produk tidak ditemukan</h2><p>Produk aktif akan muncul setelah Admin menambahkannya ke katalog.</p></div>}
  </>;
}

export function CreateOrder({ role }: { role: Exclude<Role, "admin"> }) {
  const navigate = useNavigate();
  const products = useProducts();
  const [params] = useSearchParams();
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<"cash" | "bank_transfer" | "qris">("cash");
  const [config, setConfig] = useState<CheckoutConfig>(defaultConfig);
  const [configLoading, setConfigLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<ApiOrder | null>(null);

  useEffect(() => {
    const id = Number(params.get("product"));
    const product = products.find((item) => item.id === id);
    if (product && product.stock > 0) setCounts((current) => current[product.id] ? current : { ...current, [product.id]: 1 });
  }, [params, products]);
  useEffect(() => {
    let active = true;
    apiRequest<CheckoutConfig>("/store/checkout-config/").then((value) => { if (active) { setConfig(value); if (!value.cash_enabled && value.bank_transfer_enabled) setPayment("bank_transfer"); else if (!value.cash_enabled && !value.bank_transfer_enabled && value.qris_enabled) setPayment("qris"); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Pengaturan checkout gagal dimuat."); })
      .finally(() => { if (active) setConfigLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!created || created.payment.status !== "pending_verification") return;
    let active = true;
    const poll = async () => { try { const latest = await getOrder(created.code); if (active) setCreated(latest); } catch { /* Keep last server state during temporary network errors. */ } };
    const timer = window.setInterval(() => { void poll(); }, 3500);
    void poll();
    return () => { active = false; window.clearInterval(timer); };
  }, [created?.code, created?.payment.status]);

  const selected = products.filter((product) => (counts[product.id] || 0) > 0);
  const subtotal = selected.reduce((sum, product) => sum + product.price * counts[product.id], 0);
  const total = subtotal;
  const change = (id: number, delta: number) => {
    const stock = products.find((product) => product.id === id)?.stock ?? 0;
    setCounts((current) => ({ ...current, [id]: Math.min(stock, Math.max(0, (current[id] || 0) + delta)) }));
  };
  const submit = async () => {
    if (busy || !selected.length || configLoading) return;
    setBusy(true); setError("");
    try {
      const order = await createCheckout({
        items: selected.map((product) => ({ product_id: product.id, quantity: counts[product.id] })),
        fulfillment: "pickup",
        customer_note: note.trim(),
        payment_method: payment,
      });
      setCreated(order);
      if (order.payment.method === "cash" || order.payment.method === "bank_transfer") navigate("/" + role + "/orders/" + order.code);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Pesanan gagal dibuat."); }
    finally { setBusy(false); }
  };
  const paymentConfirmed = created?.payment.status === "paid";
  const paymentExpired = created?.status === "expired" || created?.payment.status === "expired";

  return <>
    <PageTitle title="Pesan Barang" subtitle="Pilih barang, metode pemenuhan, dan pembayaran." />
    <section className="order-summary-card"><div><small>Total Belanja</small><strong>{money(total)}</strong></div><Icon name="bag" size={30} /></section>
    <h2 className="subheading">Detail Pesanan</h2>
    <section className="order-builder">{products.filter((product) => product.stock > 0).map((product) => <article key={product.id}><ProductArt type={product.art} /><div><b>{product.name}</b><span>{categoryLabel(product.category)} · {money(product.price)} · Stok {product.stock}</span></div><div className="quantity"><button type="button" aria-label={"Kurangi " + product.name} onClick={() => change(product.id, -1)}>−</button><b>{counts[product.id] || 0}</b><button type="button" aria-label={"Tambah " + product.name} disabled={(counts[product.id] || 0) >= product.stock} onClick={() => change(product.id, 1)}>+</button></div></article>)}</section>
    <section className="payment-section"><div className="payment-heading"><div><h2>Pengambilan</h2><p>Semua pesanan diambil langsung di koperasi sekolah.</p></div><Icon name="box" size={22} /></div><div className="payment-method-card selected"><span className="payment-method-symbol">AMBIL</span><span className="payment-method-copy"><strong>Ambil di koperasi</strong><small>{config.pickup_instructions || "Ambil setelah status pesanan Siap diambil."}</small></span></div><p className="payment-help">Hari operasional: {config.operating_days.map((day) => ({mon:"Senin",tue:"Selasa",wed:"Rabu",thu:"Kamis",fri:"Jumat",sat:"Sabtu",sun:"Minggu"}[day] || day)).join(", ") || "Belum diatur"} · Jam: {config.opening_time && config.closing_time ? config.opening_time + "–" + config.closing_time : "Belum diatur admin"}. Pemesanan tetap tersedia kapan saja; pengambilan hanya setelah pesanan siap dan pada jam operasional.</p></section>
    <label className="note-field">Catatan pesanan (opsional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Catatan untuk admin koperasi..." /></label>
    <section className="payment-section"><div className="payment-heading"><div><h2>Metode Pembayaran</h2><p>Pilih metode pembayaran yang tersedia.</p></div><Icon name="bag" size={22} /></div><div className="payment-method-list">
      {config.cash_enabled && <label className={"payment-method-card " + (payment === "cash" ? "selected" : "")}><input type="radio" name="payment" checked={payment === "cash"} onChange={() => setPayment("cash")} /><span className="payment-method-symbol">Rp</span><span className="payment-method-copy"><strong>Tunai</strong><small>Bayar saat pengambilan di koperasi.</small></span></label>}
      {config.bank_transfer_enabled && <label className={"payment-method-card " + (payment === "bank_transfer" ? "selected" : "")}><input type="radio" name="payment" checked={payment === "bank_transfer"} onChange={() => setPayment("bank_transfer")} /><span className="payment-method-symbol">TF</span><span className="payment-method-copy"><strong>Transfer bank</strong><small>{config.bank_name} · {config.bank_account_number} · a.n. {config.bank_account_name}</small></span></label>}
      {config.qris_enabled && <label className={"payment-method-card " + (payment === "qris" ? "selected" : "")}><input type="radio" name="payment" checked={payment === "qris"} onChange={() => setPayment("qris")} /><span className="payment-method-symbol">QR</span><span className="payment-method-copy"><strong>QRIS koperasi</strong><small>Scan QRIS resmi dan tunggu verifikasi admin.</small></span></label>}
    </div>{!config.cash_enabled && !config.bank_transfer_enabled && !config.qris_enabled && <p className="payment-unavailable">Metode pembayaran belum dikonfigurasi oleh Admin.</p>}</section>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="order-total-lines"><p><span>Subtotal</span><b>{money(subtotal)}</b></p><p><strong>Total</strong><strong>{money(total)}</strong></p></div>
    <button className="primary wide order-submit" disabled={busy || configLoading || !selected.length || (!config.cash_enabled && !config.bank_transfer_enabled && !config.qris_enabled) || !config.pickup_enabled} onClick={() => void submit()}>{busy ? "Mengirim pesanan..." : "Buat Pesanan"}</button>
    {created && created.payment.method === "qris" && <div className="modal-backdrop"><section className="modal qris-payment-modal" role="dialog" aria-modal="true" aria-labelledby="qris-title"><h2 id="qris-title">Pembayaran QRIS</h2><p>Pesanan <b>{created.code}</b></p><strong className="qris-total">{money(created.total)}</strong>{config.qris_image_url && <img className="qris-image" src={config.qris_image_url} alt="QRIS resmi toko MettaMart" />}<p>Scan QRIS toko menggunakan aplikasi pembayaran Anda. Admin akan memeriksa transaksi pada aplikasi merchant.</p><p>Status pembayaran: <b>{paymentConfirmed ? "Terkonfirmasi" : paymentExpired ? "Kedaluwarsa" : "Menunggu verifikasi Admin"}</b></p>{created.expires_at && !paymentConfirmed && <small>Batas pembayaran: {formatDate(created.expires_at)}</small>}{paymentConfirmed && <p className="payment-success">Pembayaran telah diverifikasi. Pesanan sekarang menunggu konfirmasi Admin.</p>}{paymentExpired && <p className="auth-error">Batas pembayaran berakhir. Reservasi stok akan dilepas oleh sistem.</p>}<p className="payment-help">Jangan mengirim pembayaran ke QR selain gambar QRIS yang ditampilkan pada halaman ini.</p><button className="primary wide" onClick={() => navigate("/" + role + "/orders/" + created.code)}>Lihat Status Pesanan</button></section></div>}
  </>;
}

export function ShopOrders({ role }: { role: Exclude<Role, "admin"> }) {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const response = await listOrders(undefined, page); if (active) { setOrders(pageResults(response)); setHasNext(!Array.isArray(response) && Boolean(response.next)); setHasPrevious(!Array.isArray(response) && Boolean(response.previous)); } } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Pesanan gagal dimuat."); } finally { if (active) setLoading(false); } };
    void load(); const timer = window.setInterval(() => { void load(); }, 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [page]);
  const filtered = tab === "all" ? orders : orders.filter((order) => order.status === tab);
  const filters = [{ id: "all", label: "Semua" }, { id: "pending_review", label: "Menunggu" }, { id: "processing", label: "Diproses" }, { id: "ready", label: "Siap diambil" }, { id: "completed", label: "Selesai" }];
  return <><PageTitle title={role === "student" ? "Pesanan Saya" : "Pesanan"} subtitle="Pantau status pesanan dari server." /><div className="tabs shop-tabs">{filters.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setPage(1); setTab(item.id); }}>{item.label}</button>)}</div>{error && <p className="auth-error">{error}</p>}{loading ? <div className="empty-state">Memuat pesanan...</div> : <section className="shop-orders">{filtered.map((order) => <article key={order.code}><div><b>#{order.code}</b><Status>{labels[order.status] || order.status}</Status></div><small>{formatDate(order.created_at)}</small><p>{order.items.map((item) => item.product_name + " × " + item.quantity).join(", ")}</p><footer><span>Total <strong>{money(order.total)}</strong></span><Link to={"/" + role + "/orders/" + order.code}>Lihat Detail ›</Link></footer></article>)}{!filtered.length && <div className="empty-state"><h2>Belum ada pesanan</h2><p>Pesanan yang Anda buat akan muncul di sini.</p></div>}<div className="pagination-controls"><button className="secondary-btn" disabled={!hasPrevious} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</button><span>Halaman {page}</span><button className="secondary-btn" disabled={!hasNext} onClick={() => setPage((value) => value + 1)}>Selanjutnya</button></div></section>}</>;
}

export function OrderDetail({ role }: { role: Exclude<Role, "admin"> }) {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<ApiOrder | null>(null);
  const [error, setError] = useState("");
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig>(defaultConfig);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [sendingReference, setSendingReference] = useState(false);
  useEffect(() => { let active = true; apiRequest<CheckoutConfig>("/store/checkout-config/").then((config) => { if (active) setCheckoutConfig(config); }).catch(() => undefined); return () => { active = false; }; }, []);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const value = await getOrder(code); if (active) setOrder(value); } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Detail pesanan tidak dapat dimuat."); } };
    void load(); const timer = window.setInterval(() => { void load(); }, 6000);
    return () => { active = false; window.clearInterval(timer); };
  }, [code]);
  const cancel = async () => { if (!order || !window.confirm("Batalkan pesanan ini?")) return; try { setOrder(await orderAction(order.code, "cancel")); } catch (reason) { setError(reason instanceof Error ? reason.message : "Pesanan gagal dibatalkan."); } };
  const sendPaymentReference = async () => {
    if (!order || !paymentReference.trim() || sendingReference) return;
    setSendingReference(true); setPaymentMessage("");
    try {
      setOrder(await submitPaymentReference(order.code, paymentReference.trim()));
      setPaymentReference("");
      setPaymentMessage("Referensi transfer terkirim. Pembayaran menunggu verifikasi admin.");
    } catch (reason) {
      setPaymentMessage(reason instanceof Error ? reason.message : "Referensi transfer gagal dikirim.");
    } finally { setSendingReference(false); }
  };
  if (!order) return <><PageTitle title="Detail Pesanan" subtitle="Memuat data pesanan..." />{error && <p className="auth-error">{error}</p>}</>;
  return <><button className="back-button" onClick={() => navigate(-1)}><Icon name="back" /> Kembali</button><PageTitle title="Detail Pesanan" subtitle={"#" + order.code + " · " + formatDate(order.created_at)} /><section className="detail-card"><div className="detail-head"><span className="mini-icon"><Icon name="bag" /></span><div><b>#{order.code}</b><small>{formatDate(order.created_at)}</small></div><Status>{labels[order.status] || order.status}</Status></div><h2>Item Pesanan</h2>{order.items.map((item) => <div className="detail-product" key={item.id}><div><b>{item.product_name}</b><small>{item.quantity} {item.unit} × {money(item.unit_price)}</small></div><span>{money(item.line_total)}</span></div>)}<div className="detail-total"><span>Subtotal</span><strong>{money(order.subtotal)}</strong></div><div className="detail-total"><span>Total Belanja</span><strong>{money(order.total)}</strong></div><h2>Pembayaran</h2><dl><dt>Metode</dt><dd>{order.payment.method.toUpperCase()}</dd><dt>Status</dt><dd>{order.payment.status === "paid" ? "Lunas" : order.payment.status === "pending_verification" ? "Menunggu verifikasi Admin" : order.payment.status === "refund_pending" ? "Menunggu pengembalian dana" : order.payment.status}</dd><dt>Kode pembayaran</dt><dd>{order.payment.reference}</dd>{order.payment.payment_reference && <><dt>Referensi transfer</dt><dd>{order.payment.payment_reference}</dd></>}</dl>{order.payment.method === "qris" && order.payment.status === "pending_verification" && checkoutConfig.qris_image_url && <div className="qris-resume"><h2>Lanjutkan Pembayaran QRIS</h2><img className="qris-image" src={checkoutConfig.qris_image_url} alt="QRIS resmi koperasi MettaMart" /><p>Scan QR ini lalu tunggu verifikasi Admin. Batas pembayaran: {order.expires_at ? formatDate(order.expires_at) : "20 menit sejak checkout"}.</p></div>}
    {order.payment.method === "bank_transfer" && ["unpaid", "failed"].includes(order.payment.status) && order.status === "awaiting_payment" && <div className="payment-section"><h2>Instruksi Transfer Bank</h2><p>Bank: {checkoutConfig.bank_name}</p><p>Atas nama: {checkoutConfig.bank_account_name}</p><p>Nomor rekening: <b>{checkoutConfig.bank_account_number}</b></p><p>Total transfer: <b>{money(order.total)}</b></p><label className="note-field">Nomor referensi transfer<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={120} placeholder="Masukkan nomor referensi transaksi" /></label><button className="primary wide" disabled={!paymentReference.trim() || sendingReference} onClick={() => void sendPaymentReference()}>{sendingReference ? "Mengirim..." : "Kirim Referensi Transfer"}</button>{paymentMessage && <p role="status">{paymentMessage}</p>}{order.payment.verification_note && <p className="payment-help">{order.payment.verification_note}</p>}</div>}
    {order.payment.method === "bank_transfer" && order.payment.status === "pending_verification" && <p className="payment-help">Referensi transfer sudah dikirim. Admin koperasi akan memeriksa mutasi rekening sebelum pesanan diproses.</p>}<h2>Riwayat Pesanan</h2><ol className="order-history">{order.status_history.map((entry, index) => <li key={index}><b>{labels[entry.to_status] || entry.to_status}</b><small>{formatDate(entry.created_at)}</small>{entry.note && <span>{entry.note}</span>}</li>)}</ol>{error && <p className="auth-error">{error}</p>}{["awaiting_payment", "pending_review"].includes(order.status) && <button className="secondary-btn wide" onClick={() => void cancel()}>Batalkan Pesanan</button>}</section></>;
}

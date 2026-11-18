import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Icon, PageTitle, ProductArt, Status } from "../../components/ui";
import {
  ALL_CATEGORIES,
  categories,
  categoryLabel,
  isCategoryId,
  type CategoryId,
} from "../../data/categories";
import { money, notices } from "../../data/mock";
import { useAuth } from "../../hooks/useAuth";
import { stockLabel, useProducts } from "../../services/products";
import type { Role } from "../../types";
import { createOrder, fetchOrders, fetchOrder, submitPayment, type CommerceOrder } from "../../services/commerce";
import { fetchStorefrontSettings } from "../../services/settings";

export function ShopDashboard({ role }: { role: Exclude<Role, "admin"> }) {
  const { session } = useAuth();
  const products = useProducts();
  const base = `/${role}`;
  return (
    <>
      <PageTitle
        title={`Halo, ${session?.name}!`}
        subtitle={
          role === "parent"
            ? "Semoga hari ini menyenangkan untuk anak Anda."
            : "Semangat belajar hari ini!"
        }
      />
      {role !== "parent" && (
        <section className="shop-profile">
          <span className="role-avatar">AP</span>
          <div>
            <small>Siswa</small>
            <b>Andi Pratama</b>
            <span>Kelas 8A</span>
          </div>
          <span>›</span>
        </section>
      )}
      {role === "parent" && (
        <section className="monthly-card">
          <div>
            <small>Total Belanja Bulan Ini</small>
            <strong>Rp 120.000</strong>
            <Link to={`${base}/orders`}>Lihat Detail ›</Link>
          </div>
          <Icon name="bag" size={32} />
        </section>
      )}
      <label className="search shop-search">
        <Icon name="search" />
        <input
          placeholder="Cari barang, buku, atau kebutuhan sekolah..."
          onFocus={() => navigate(`${base}/stock`)}
        />
      </label>
      <div className="section-heading">
        <h2>{role === "parent" ? "Kebutuhan Anak" : "Kategori"}</h2>
        <Link to={`${base}/stock`}>Lihat Semua ›</Link>
      </div>
      <section className="category-grid">
        {categories.map((item) => (
          <Link to={`${base}/stock?category=${item.id}`} key={item.id}>
            <span>
              <Icon name={item.icon} />
            </span>
            {item.label}
          </Link>
        ))}
      </section>
      <div className="section-heading">
        <h2>{role === "parent" ? "Pesanan Terbaru" : "Stok Tersedia"}</h2>
        <Link to={role === "parent" ? `${base}/orders` : `${base}/stock`}>Lihat Semua ›</Link>
      </div>
      {role === "parent" ? (
        <section className="recent-order">
          <span className="mini-icon">
            <Icon name="bag" />
          </span>
          <div>
            <b>#MTM-0128</b>
            <small>12 Okt 2025, 09:45</small>
          </div>
          <Status>Diproses</Status>
          <strong>Rp 45.000</strong>
        </section>
      ) : (
        <section className="product-strip shop-strip">
          {products.slice(0, 3).map((product) => (
            <article key={product.id}>
              <ProductArt type={product.art} />
              <b>{product.name}</b>
              <span>{money(product.price)}</span>
              <Status>Tersedia</Status>
              <Link to={`${base}/order?product=${product.id}`}>Pesan</Link>
            </article>
          ))}
        </section>
      )}
      <section className="shop-promo">
        <Icon name="bag" size={28} />
        <div>
          <b>Dukung kebutuhan belajar</b>
          <p>Pesan perlengkapan sekolah dengan mudah dan aman.</p>
        </div>
      </section>
    </>
  );
}

export function ShopStock({ role }: { role: Exclude<Role, "admin"> }) {
  const products = useProducts();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const requested = params.get("category");
  const category: CategoryId | typeof ALL_CATEGORIES = isCategoryId(requested)
    ? requested
    : ALL_CATEGORIES;
  const selectCategory = (next: CategoryId | typeof ALL_CATEGORIES) =>
    setParams(next === ALL_CATEGORIES ? {} : { category: next }, { replace: true });
  const list = useMemo(
    () =>
      products.filter((p) => {
        const needle = query.trim().toLowerCase();
        return (
          (!needle ||
            p.name.toLowerCase().includes(needle) ||
            categoryLabel(p.category).toLowerCase().includes(needle)) &&
          (category === ALL_CATEGORIES || p.category === category)
        );
      }),
    [products, query, category],
  );
  return (
    <>
      <PageTitle title="Stok Barang" subtitle="Temukan kebutuhan sekolah yang tersedia." />
      <label className="search shop-search">
        <Icon name="search" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari produk..."
        />
      </label>
      <div className="tabs shop-tabs">
        {[{ id: ALL_CATEGORIES, label: "Semua" }, ...categories].map((item) => (
          <button
            key={item.id}
            className={category === item.id ? "active" : ""}
            onClick={() => selectCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="shop-product-grid">
        {list.map((product) => (
          <article key={product.id}>
            <ProductArt type={product.art} />
            <div>
              <b>{product.name}</b>
              <span>{money(product.price)}</span>
              <small>
                {categoryLabel(product.category)} · Stok: {product.stock}
              </small>
            </div>
            <Status>{stockLabel(product.stock)}</Status>
            <Link
              className={product.stock === 0 ? "disabled" : ""}
              to={product.stock ? `/${role}/order?product=${product.id}` : "#"}
            >
              Pesan
            </Link>
          </article>
        ))}
      </section>
      {!list.length && (
        <div className="empty-state">
          <Icon name="search" size={34} />
          <h2>Produk tidak ditemukan</h2>
          <p>Coba gunakan kata kunci atau kategori lain.</p>
        </div>
      )}
    </>
  );
}

export function CreateOrder({ role }: { role: Exclude<Role, "admin"> }) {
  const navigate = useNavigate();
  const products = useProducts();
  const [params] = useSearchParams();
  const [counts, setCounts] = useState<Record<number, number>>(() => {
    const id = Number(params.get("product"));
    const product = products.find((item) => item.id === id);
    return product && product.stock > 0 ? { [product.id]: 1 } : {};
  });
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [payment, setPayment] = useState<"cash" | "qris" | "bankTransfer">("cash");
  const [paymentSettings, setPaymentSettings] = useState({ cash: true, qris: true, bank_transfer: true });
  useEffect(() => {
    fetchStorefrontSettings().then((settings) => setPaymentSettings(settings.payment_methods)).catch(() => undefined);
  }, []);
  const methods = [
    { id: "cash" as const, title: "Tunai", description: "Bayar tunai saat pengambilan di koperasi.", symbol: "Rp", enabled: paymentSettings.cash },
    { id: "qris" as const, title: "QRIS", description: "Gunakan QRIS resmi koperasi dan tunggu verifikasi admin.", symbol: "QR", enabled: paymentSettings.qris },
    { id: "bankTransfer" as const, title: "Transfer bank", description: "Transfer ke rekening resmi koperasi dan kirim referensi pembayaran.", symbol: "TF", enabled: paymentSettings.bank_transfer },
  ].filter((method) => method.enabled);
  const selectedPayment = methods.some((method) => method.id === payment) ? payment : methods[0]?.id;
  const selected = products.filter((product) => counts[product.id]);
  const total = selected.reduce((sum, product) => sum + product.price * counts[product.id], 0);
  const change = (id: number, amount: number) => {
    const stock = products.find((product) => product.id === id)?.stock ?? 0;
    setCounts((current) => ({
      ...current,
      [id]: Math.min(stock, Math.max(0, (current[id] || 0) + amount)),
    }));
  };
  const submit = async () => {
    if (!total || !selectedPayment || sent || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const order = await createOrder({
        items: selected.map((product) => ({ product_id: product.id, quantity: counts[product.id] })),
        payment_method: selectedPayment === "bankTransfer" ? "bank_transfer" : selectedPayment,
        note,
      });
      setCreatedCode(order.code);
      setSent(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Pesanan gagal dibuat. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <>
      <PageTitle title="Pesan Barang" subtitle="Pilih jumlah barang dan metode pembayaran." />
      <section className="order-summary-card">
        <div>
          <small>Total Belanja</small>
          <strong>{money(total)}</strong>
        </div>
        <Icon name="bag" size={30} />
      </section>
      <h2 className="subheading">Detail Pesanan</h2>
      <section className="order-builder">
        {products.map((product) => (
          <article key={product.id}>
            <ProductArt type={product.art} />
            <div>
              <b>{product.name}</b>
              <span>
                {categoryLabel(product.category)} · {money(product.price)}
              </span>
            </div>
            <div className="quantity">
              <button type="button" aria-label={`Kurangi ${product.name}`} onClick={() => change(product.id, -1)}>−</button>
              <b>{counts[product.id] || 0}</b>
              <button
                type="button"
                aria-label={`Tambah ${product.name}`}
                disabled={(counts[product.id] || 0) >= product.stock}
                onClick={() => change(product.id, 1)}
              >
                +
              </button>
            </div>
          </article>
        ))}
      </section>
      <label className="note-field">
        Catatan (opsional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Contoh: warna biru, ukuran besar, dll."
        />
      </label>
      <section className="payment-section" aria-labelledby="payment-heading">
        <div className="payment-heading">
          <div>
            <h2 id="payment-heading">Metode Pembayaran</h2>
            <p>Pilih cara pembayaran untuk pesanan ini.</p>
          </div>
          <Icon name="bag" size={22} />
        </div>
        {methods.length ? (
          <div className="payment-method-list">
            {methods.map((method) => (
              <label className={`payment-method-card ${selectedPayment === method.id ? "selected" : ""}`} key={method.id}>
                <input
                  type="radio"
                  name="payment-method"
                  value={method.id}
                  checked={selectedPayment === method.id}
                  onChange={() => setPayment(method.id)}
                  disabled={sent}
                />
                <span className="payment-method-symbol" aria-hidden="true">{method.symbol}</span>
                <span className="payment-method-copy">
                  <strong>{method.title}</strong>
                  <small>{method.description}</small>
                </span>
                <span className="payment-method-check" aria-hidden="true">{selectedPayment === method.id ? "✓" : ""}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="payment-unavailable" role="status">
            Belum ada metode pembayaran yang diaktifkan. Hubungi admin sekolah.
          </p>
        )}
        {selectedPayment === "qris" && (
          <p className="payment-help">Kode QRIS akan diberikan oleh kasir/admin. Jangan transfer ke kode atau rekening dari sumber yang tidak resmi.</p>
        )}
        {selectedPayment === "bankTransfer" && (
          <p className="payment-help">Detail rekening dan konfirmasi pembayaran akan diberikan oleh admin setelah pesanan diterima.</p>
        )}
        {selectedPayment === "cash" && (
          <p className="payment-help">Siapkan pembayaran tunai saat mengambil pesanan di kasir.</p>
        )}
      </section>
      {sent && (
        <p className="payment-success" role="status">
          Pesanan {createdCode} berhasil dibuat. Status awal: menunggu konfirmasi admin. Pembayaran belum dianggap lunas.
        </p>
      )}
      {submitError && <p className="payment-unavailable" role="alert">{submitError}</p>}
      <button className="primary wide order-submit" disabled={!total || sent || submitting || !methods.length} onClick={submit}>
        {submitting ? "Mengirim pesanan..." : sent ? "Pesanan berhasil dibuat" : "Kirim Pesanan"}
      </button>
      {sent && <Link className="primary wide" to={`/${role}/orders/${createdCode}`}>Lihat Detail Pesanan</Link>}
      <p className="payment-disclaimer">Pemesanan dapat dilakukan kapan saja. Pengambilan hanya dapat dilakukan saat koperasi buka dan pesanan sudah berstatus siap diambil.</p>
    </>
  );
}

function orderStatusText(status: CommerceOrder["status"]) {
  return ({ pending: "Menunggu Konfirmasi", accepted: "Diproses", ready_for_pickup: "Siap Diambil", completed: "Selesai", cancelled: "Dibatalkan" })[status];
}
function paymentStatusText(status: CommerceOrder["payment_status"]) {
  return ({ unpaid: "Belum Dibayar", pending_verification: "Menunggu Verifikasi", paid: "Lunas", failed: "Perlu Konfirmasi Ulang", refunded: "Dikembalikan" })[status];
}

export function ShopOrders({ role }: { role: Exclude<Role, "admin"> }) {
  const [tab, setTab] = useState("Semua");
  const [items, setItems] = useState<CommerceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetchOrders().then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : "Pesanan gagal dimuat.")).finally(() => setLoading(false));
  }, []);
  const shown = tab === "Semua" ? items : items.filter((order) => orderStatusText(order.status) === tab);
  const tabs = ["Semua", "Menunggu Konfirmasi", "Diproses", "Siap Diambil", "Selesai", "Dibatalkan"];
  return (
    <>
      <PageTitle title={role === "student" ? "Pesanan Saya" : "Pesanan"} subtitle="Pantau status pesanan dan pengambilan." />
      <div className="tabs shop-tabs">
        {tabs.map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}
      </div>
      {loading && <p>Memuat pesanan...</p>}
      {error && <p className="payment-unavailable" role="alert">{error}</p>}
      {!loading && !error && !shown.length && <div className="empty-state"><h2>Belum ada pesanan</h2><p>Pesanan yang dibuat akan muncul di sini.</p></div>}
      <section className="shop-orders">
        {shown.map((order) => (
          <article key={order.code}>
            <div><b>#{order.code}</b><Status>{orderStatusText(order.status)}</Status></div>
            <small>{new Date(order.created_at).toLocaleString("id-ID")}</small>
            <p>{order.items.map((item) => `${item.product_name} × ${item.quantity}`).join(", ")}</p>
            <small>Pembayaran: {paymentStatusText(order.payment_status)}</small>
            <footer><span>Total <strong>{money(order.total)}</strong></span><Link to={`/${role}/orders/${order.code}`}>Lihat Detail ›</Link></footer>
          </article>
        ))}
      </section>
    </>
  );
}

export function OrderDetail({ role }: { role: Exclude<Role, "admin"> }) {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [sendingPayment, setSendingPayment] = useState(false);
  useEffect(() => {
    fetchOrder(code).then(setOrder).catch((reason) => setError(reason instanceof Error ? reason.message : "Detail pesanan gagal dimuat.")).finally(() => setLoading(false));
  }, [code]);
  const sendPayment = async () => {
    if (!paymentNote.trim() || sendingPayment) return;
    setSendingPayment(true); setPaymentMessage("");
    try {
      setOrder(await submitPayment(code, paymentNote));
      setPaymentMessage("Referensi pembayaran berhasil dikirim dan menunggu verifikasi admin.");
      setPaymentNote("");
    } catch (reason) {
      setPaymentMessage(reason instanceof Error ? reason.message : "Referensi pembayaran gagal dikirim.");
    } finally { setSendingPayment(false); }
  };
  if (loading) return <p>Memuat detail pesanan...</p>;
  if (error || !order) return <div className="empty-state"><h2>Pesanan tidak ditemukan</h2><p>{error || "Periksa kembali nomor pesanan."}</p><button className="primary" onClick={() => navigate(-1)}>Kembali</button></div>;
  const status = orderStatusText(order.status);
  return (
    <>
      <button className="back-button" onClick={() => navigate(-1)}><Icon name="back" /> Kembali</button>
      <PageTitle title="Detail Pesanan" subtitle={`#${order.code} · ${new Date(order.created_at).toLocaleString("id-ID")}`} />
      <section className="detail-card">
        <div className="detail-head"><span className="mini-icon"><Icon name="box" /></span><div><b>#{order.code}</b><small>{new Date(order.created_at).toLocaleString("id-ID")}</small></div><Status>{status}</Status></div>
        <h2>Item Pesanan</h2>
        {order.items.map((item) => <div className="detail-product" key={item.product_id}><ProductArt type="book" /><div><b>{item.product_name}</b><small>{item.quantity} × {money(item.unit_price)}</small><span>{money(item.line_total)}</span></div></div>)}
        <div className="detail-total"><span>Total Belanja</span><strong>{money(order.total)}</strong></div>
        <h2>Informasi Pengambilan</h2>
        <dl><dt>Lokasi</dt><dd>Koperasi sekolah</dd><dt>Ketentuan</dt><dd>Ambil saat jam operasional setelah status Siap Diambil.</dd><dt>Status</dt><dd><Status>{status}</Status></dd><dt>Pembayaran</dt><dd>{paymentStatusText(order.payment_status)}</dd></dl>
        <div className="timeline"><b>Pesanan diterima</b><span>{order.accepted_at ? "Diproses" : "Menunggu konfirmasi admin"}</span><span>{order.ready_at ? "Siap diambil" : "Belum siap diambil"}</span><span>{order.completed_at ? "Pengambilan selesai" : "Menunggu pengambilan"}</span></div>
        {order.payment_method !== "cash" && order.payment_status !== "paid" && order.status !== "cancelled" && (
          <section className="payment-section"><h2>Konfirmasi Pembayaran</h2><p>Masukkan nomor referensi atau keterangan transfer/QRIS. Admin tetap harus memverifikasi sebelum status menjadi lunas.</p><textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Nomor referensi atau keterangan pembayaran" /><button className="primary wide" disabled={!paymentNote.trim() || sendingPayment || order.payment_status === "pending_verification"} onClick={sendPayment}>{sendingPayment ? "Mengirim..." : order.payment_status === "pending_verification" ? "Menunggu Verifikasi" : "Kirim Konfirmasi"}</button>{paymentMessage && <p role="status">{paymentMessage}</p>}</section>
        )}
        <button className="primary wide" onClick={() => alert("Silakan hubungi admin koperasi melalui kanal komunikasi sekolah.")}>Hubungi Admin</button>
      </section>
    </>
  );
}

export function ShopNotifications() {
  const [read, setRead] = useState<number[]>([]);
  return (
    <>
      <PageTitle title="Notifikasi" subtitle="Informasi terbaru dari MettaMart." />
      <section className="shop-notices">
        {notices.map((notice, index) => (
          <button
            className={read.includes(index) ? "read" : ""}
            key={notice.title}
            onClick={() => setRead([...new Set([...read, index])])}
          >
            <span className="mini-icon">
              <Icon name={index % 2 ? "box" : "bell"} />
            </span>
            <div>
              <b>{notice.title}</b>
              <p>{notice.text}</p>
              <time>{notice.time}</time>
            </div>
            <span>›</span>
          </button>
        ))}
      </section>
    </>
  );
}

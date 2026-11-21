import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Icon, Modal, PageTitle, ProductArt, Status } from "../../components/ui";
import {
  ALL_CATEGORIES,
  categories,
  categoryLabel,
  isCategoryId,
  type CategoryId,
} from "../../data/categories";
import { money } from "../../data/mock";
import { useAuth } from "../../hooks/useAuth";
import { refreshProducts, stockLabel, useProducts } from "../../services/products";
import type { Role } from "../../types";
import { createOrder, fetchOrders, fetchOrder, submitPayment, type CommerceOrder } from "../../services/commerce";
import { fetchStorefrontSettings, type StorefrontSettings } from "../../services/settings";
import { fetchNotifications, markNotificationRead, type AppNotification } from "../../services/notifications";

export function ShopDashboard({ role }: { role: Exclude<Role, "admin"> }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const products = useProducts();
  const base = `/${role}`;
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [dataError, setDataError] = useState("");
  useEffect(() => {
    fetchOrders().then(setOrders).catch((reason) => setDataError(reason instanceof Error ? reason.message : "Ringkasan pesanan gagal dimuat."));
  }, [role]);
  const now = new Date();
  const monthSpend = orders.filter((order) => {
    const date = new Date(order.created_at);
    return order.payment_status === "paid" && order.status === "completed" && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).reduce((total, order) => total + order.total, 0);
  const latestOrder = orders[0];
  const statusText = latestOrder ? ({ pending: "Menunggu Konfirmasi", accepted: "Diproses", ready_for_pickup: "Siap Diambil", completed: "Selesai", cancelled: "Dibatalkan" }[latestOrder.status]) : "";
  return (
    <>
      <PageTitle title={`Halo, ${session?.name || "Pengguna"}!`} subtitle={role === "parent" ? "Belanja kebutuhan sekolah dan pantau pesanan akun Anda." : "Temukan kebutuhan sekolah di koperasi."} />
      {role === "student" && (
        <section className="shop-profile">
          <span className="role-avatar">{(session?.name || "S").slice(0, 2).toUpperCase()}</span>
          <div><small>Akun Siswa</small><b>{session?.name || "Siswa"}</b><span>Data identitas dikelola sekolah</span></div>
          <span>›</span>
        </section>
      )}
      {role === "parent" && (
        <>
          <section className="monthly-card">
            <div><small>Total Belanja Lunas Bulan Ini</small><strong>{money(monthSpend)}</strong><Link to={`${base}/orders`}>Lihat Detail ›</Link></div>
            <Icon name="bag" size={32} />
          </section>
        </>
      )}
      {dataError && <p className="payment-unavailable" role="alert">{dataError}</p>}
      <label className="search shop-search">
        <Icon name="search" />
        <input placeholder="Cari barang, buku, atau kebutuhan sekolah..." onFocus={() => navigate(`${base}/stock`)} />
      </label>
      <div className="section-heading"><h2>{role === "parent" ? "Kebutuhan Sekolah" : "Kategori"}</h2><Link to={`${base}/stock`}>Lihat Semua ›</Link></div>
      <section className="category-grid">
        {categories.map((item) => <Link to={`${base}/stock?category=${item.id}`} key={item.id}><span><Icon name={item.icon} /></span>{item.label}</Link>)}
      </section>
      <div className="section-heading"><h2>{role === "parent" ? "Pesanan Terbaru" : "Stok Tersedia"}</h2><Link to={role === "parent" ? `${base}/orders` : `${base}/stock`}>Lihat Semua ›</Link></div>
      {role === "parent" ? (
        latestOrder ? <section className="recent-order"><span className="mini-icon"><Icon name="bag" /></span><div><b>#{latestOrder.code}</b><small>{latestOrder.beneficiary_name ? `Untuk ${latestOrder.beneficiary_name} · ` : ""}{new Date(latestOrder.created_at).toLocaleString("id-ID")}</small></div><Status>{statusText}</Status><strong>{money(latestOrder.total)}</strong><Link to={`${base}/orders/${latestOrder.code}`}>Detail</Link></section> : <div className="empty-state"><p>Belum ada pesanan dari akun ini.</p></div>
      ) : (
        <section className="product-strip shop-strip">{products.slice(0, 3).map((product) => <article key={product.id}><ProductArt type={product.art} /><b>{product.name}</b><span>{money(product.price)}</span><Status>{stockLabel(product.stock)}</Status><Link to={`${base}/order?product=${product.id}`}>Pesan</Link></article>)}</section>
      )}
      <section className="shop-promo"><Icon name="bag" size={28} /><div><b>Dukung kebutuhan belajar</b><p>Pesan perlengkapan sekolah dengan mudah dan aman.</p></div></section>
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
  const products = useProducts();
  const [params] = useSearchParams();
  const [counts, setCounts] = useState<Record<number, number>>(() => {
    const id = Number(params.get("product"));
    const product = products.find((item) => item.id === id);
    return product && product.stock > 0 ? { [product.id]: 1 } : {};
  });
  // Products load asynchronously; initialize a deep-linked product after the API response arrives.
  useEffect(() => {
    const id = Number(params.get("product"));
    if (!Number.isInteger(id) || id <= 0) return;
    const product = products.find((item) => item.id === id);
    if (!product || product.stock < 1) return;
    setCounts((current) => Object.keys(current).length ? current : { [product.id]: 1 });
  }, [params, products]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [payment, setPayment] = useState<"cash" | "qris" | "bankTransfer">("cash");
  const [paymentSettings, setPaymentSettings] = useState({ cash: true, qris: true, bank_transfer: true });
  const [paymentInstructions, setPaymentInstructions] = useState({ bank_name: "", account_name: "", account_number: "", qris_note: "" });
  useEffect(() => {
    fetchStorefrontSettings().then((settings) => { setPaymentSettings(settings.payment_methods); setPaymentInstructions(settings.payment_instructions); }).catch(() => undefined);
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
      // Keep the catalogue stock in sync without turning a successful order into a false error.
      refreshProducts().catch(() => undefined);
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
          <p className="payment-help">{paymentInstructions.qris_note || "Gunakan QRIS resmi koperasi dan tunggu verifikasi admin."} Jangan gunakan kode dari sumber yang tidak resmi.</p>
        )}
        {selectedPayment === "bankTransfer" && (
          <p className="payment-help">{paymentInstructions.bank_name ? `Bank: ${paymentInstructions.bank_name}. ` : ""}{paymentInstructions.account_name ? `Atas nama: ${paymentInstructions.account_name}. ` : ""}{paymentInstructions.account_number ? `Nomor rekening: ${paymentInstructions.account_number}.` : "Detail rekening belum diatur admin."} Setelah transfer, kirim referensi pembayaran pada detail pesanan.</p>
        )}
        {selectedPayment === "cash" && (
          <p className="payment-help">Siapkan pembayaran tunai saat mengambil pesanan di koperasi.</p>
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
            <small>{new Date(order.created_at).toLocaleString("id-ID")}{order.beneficiary_name ? ` · Untuk ${order.beneficiary_name}` : ""}</small>
            <p>{order.items.map((item) => `${item.product_name} × ${item.quantity}`).join(", ")}</p>
            <small>Pembayaran: {paymentStatusText(order.payment_status)}</small>
            <footer><span>Total <strong>{money(order.total)}</strong></span><Link to={`/${role}/orders/${order.code}`}>Lihat Detail ›</Link></footer>
          </article>
        ))}
      </section>
    </>
  );
}

const DAY_LABELS: Record<string, string> = { mon: "Senin", tue: "Selasa", wed: "Rabu", thu: "Kamis", fri: "Jumat", sat: "Sabtu", sun: "Minggu" };
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Ubah nomor lokal (08xx / +62 / 62) menjadi format wa.me (62xx); kosong bila tidak valid.
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function ContactInfo({ store, error, orderCode }: { store: StorefrontSettings | null; error: string; orderCode: string }) {
  if (error) return <p className="payment-unavailable" role="alert">{error}</p>;
  if (!store) return <p className="contact-info__loading">Memuat info kontak...</p>;
  const { phone, email, address, name } = store.store_profile;
  const wa = whatsappNumber(phone);
  const hours = store.operating_hours;
  const days = DAY_ORDER.filter((day) => hours.days.includes(day)).map((day) => DAY_LABELS[day]).join(", ");
  const message = encodeURIComponent(`Halo admin ${name || "koperasi"}, saya ingin menanyakan pesanan #${orderCode}.`);
  return (
    <div className="contact-info">
      <p>Hubungi koperasi untuk menanyakan pesanan <b>#{orderCode}</b>.</p>
      <dl>
        <dt>WhatsApp</dt>
        <dd>{phone || "Belum diatur admin"}</dd>
        {email && <><dt>Email</dt><dd><a href={`mailto:${email}`}>{email}</a></dd></>}
        {address && <><dt>Lokasi</dt><dd>{address}</dd></>}
        {days && <><dt>Jam layanan</dt><dd>{days} · {hours.open_time}–{hours.close_time}</dd></>}
      </dl>
      {wa
        ? <a className="primary wide" href={`https://wa.me/${wa}?text=${message}`} target="_blank" rel="noopener noreferrer">Chat via WhatsApp</a>
        : <p className="table-foot">Nomor WhatsApp koperasi belum diatur. Silakan datang langsung ke koperasi pada jam layanan.</p>}
    </div>
  );
}

export function OrderDetail({ role }: { role: Exclude<Role, "admin"> }) {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [senderName, setSenderName] = useState("");
  const [paymentSource, setPaymentSource] = useState("");
  const [accountLast4, setAccountLast4] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [sendingPayment, setSendingPayment] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [store, setStore] = useState<StorefrontSettings | null>(null);
  const [storeError, setStoreError] = useState("");
  const openContact = () => {
    setContactOpen(true);
    if (store) return;
    setStoreError("");
    fetchStorefrontSettings().then(setStore).catch(() => setStoreError("Info kontak koperasi gagal dimuat. Coba lagi beberapa saat."));
  };
  useEffect(() => {
    fetchOrder(code).then(setOrder).catch((reason) => setError(reason instanceof Error ? reason.message : "Detail pesanan gagal dimuat.")).finally(() => setLoading(false));
  }, [code]);
  const sendPayment = async () => {
    if (!senderName.trim() || !paymentSource.trim() || sendingPayment) return;
    setSendingPayment(true); setPaymentMessage("");
    try {
      setOrder(await submitPayment(code, { sender_name: senderName.trim(), payment_source: paymentSource.trim(), account_last4: accountLast4.trim(), note: paymentNote.trim() }));
      setPaymentMessage("Referensi pembayaran berhasil dikirim dan menunggu verifikasi admin.");
      setPaymentNote("");
      setSenderName("");
      setPaymentSource("");
      setAccountLast4("");
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
      <section className="detail-card order-detail">
        <div className="detail-head"><span className="mini-icon"><Icon name="box" /></span><div><b>#{order.code}</b><small>{new Date(order.created_at).toLocaleString("id-ID")}</small></div><Status>{status}</Status></div>
        <h2>Item Pesanan</h2>
        {order.beneficiary_name && <p className="order-detail__for">Pesanan untuk siswa: <b>{order.beneficiary_name}</b></p>}
        <div className="order-detail__items">
          {order.items.map((item) => <div className="detail-product" key={item.product_id}><ProductArt type="book" /><div><b>{item.product_name}</b><small>{item.quantity} × {money(item.unit_price)}</small></div><strong>{money(item.line_total)}</strong></div>)}
        </div>
        <div className="detail-total"><span>Total Belanja</span><strong>{money(order.total)}</strong></div>
        <h2>Informasi Pengambilan</h2>
        <dl><dt>Lokasi</dt><dd>Koperasi sekolah</dd><dt>Ketentuan</dt><dd>Ambil saat jam operasional setelah status Siap Diambil.</dd><dt>Status</dt><dd><Status>{status}</Status></dd><dt>Pembayaran</dt><dd>{paymentStatusText(order.payment_status)}</dd></dl>
        <div className="timeline"><b>Pesanan diterima</b><span>{order.accepted_at ? "Diproses" : "Menunggu konfirmasi admin"}</span><span>{order.ready_at ? "Siap diambil" : "Belum siap diambil"}</span><span>{order.completed_at ? "Pengambilan selesai" : "Menunggu pengambilan"}</span></div>
        {order.payment_method !== "cash" && order.payment_status !== "paid" && order.status !== "cancelled" && (
          <section className="payment-section"><h2>Identitas Pembayaran</h2><p>Isi identitas rekening atau e-wallet yang digunakan untuk transfer. Admin akan mencocokkannya dengan dana yang masuk. Ini bukan bukti pembayaran otomatis.</p><label>Nama pemilik rekening/e-wallet<input value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} placeholder="Nama sesuai akun pengirim" /></label><label>Bank atau e-wallet asal<input value={paymentSource} onChange={(event) => setPaymentSource(event.target.value)} maxLength={80} placeholder="Contoh: BCA, Mandiri, DANA, GoPay" /></label><label>4 digit terakhir rekening (opsional)<input inputMode="numeric" value={accountLast4} onChange={(event) => setAccountLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} maxLength={4} placeholder="1234" /></label><label>Catatan tambahan (opsional)<textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} maxLength={300} placeholder="Contoh: transfer pukul 14.30" /></label><button className="primary wide" disabled={!senderName.trim() || !paymentSource.trim() || (accountLast4.length > 0 && accountLast4.length !== 4) || sendingPayment || order.payment_status === "pending_verification"} onClick={sendPayment}>{sendingPayment ? "Mengirim..." : order.payment_status === "pending_verification" ? "Menunggu Verifikasi" : "Kirim Identitas Pembayaran"}</button>{paymentMessage && <p role="status">{paymentMessage}</p>}</section>
        )}
        <button className="primary wide" onClick={openContact}>Hubungi Admin</button>
      </section>
      {contactOpen && (
        <Modal title="Hubungi Admin Koperasi" close={() => setContactOpen(false)}>
          <ContactInfo store={store} error={storeError} orderCode={order.code} />
          <button type="button" className="secondary contact-info__close" onClick={() => setContactOpen(false)}>Tutup</button>
        </Modal>
      )}
    </>
  );
}

export function ShopNotifications() {
  const { session } = useAuth();
  const role = session?.role === "parent" ? "parent" : "student";
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AppNotification | null>(null);
  useEffect(() => {
    fetchNotifications().then(setItems)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Notifikasi gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);
  const openNotice = async (notice: AppNotification) => {
    setSelected({ ...notice, is_read: true });
    if (notice.is_read) return;
    try {
      await markNotificationRead(notice.id);
      setItems((current) => current.map((item) => item.id === notice.id ? { ...item, is_read: true } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status notifikasi gagal diperbarui.");
    }
  };
  const kindLabel = ({ order: "Pesanan", payment: "Pembayaran", stock: "Stok", announcement: "Pengumuman" } as Record<string, string>);
  return (
    <>
      <PageTitle title="Notifikasi" subtitle="Informasi pesanan dan pengumuman dari koperasi." />
      {loading && <p>Memuat notifikasi...</p>}
      {error && <p className="payment-unavailable" role="alert">{error}</p>}
      {!loading && !error && !items.length && <div className="empty-state"><h2>Belum ada notifikasi</h2><p>Informasi terbaru dari koperasi akan muncul di sini.</p></div>}
      <section className="shop-notices">
        {items.map((notice) => (
          <button type="button" className={notice.is_read ? "read" : ""} key={notice.id} onClick={() => openNotice(notice)} aria-label={`Lihat detail: ${notice.title}`}>
            <span className="mini-icon"><Icon name={notice.kind === "payment" ? "bag" : "bell"} /></span>
            <div>
              <b>{notice.title}</b>
              <p>{notice.message}</p>
              <time>{new Date(notice.created_at).toLocaleString("id-ID")}</time>
              {notice.target_code && <small>Pesanan {notice.target_code}</small>}
            </div>
            <span className="notice-detail-chip">Detail</span>
          </button>
        ))}
      </section>
      {selected && (
        <Modal title="Detail Notifikasi" close={() => setSelected(null)}>
          <div className="notice-detail">
            <div className="notice-detail__meta">
              <span className="mini-icon"><Icon name={selected.kind === "payment" ? "bag" : "bell"} /></span>
              <div>
                <span className="notice-detail__kind">{kindLabel[selected.kind] || "Informasi"}</span>
                <time>{new Date(selected.created_at).toLocaleString("id-ID")}</time>
              </div>
            </div>
            <h3>{selected.title}</h3>
            <p>{selected.message}</p>
            {selected.target_code && <dl><dt>Pesanan terkait</dt><dd>#{selected.target_code}</dd></dl>}
            <div className="notice-detail__actions">
              {selected.target_code && <Link className="primary" to={`/${role}/orders/${selected.target_code}`}>Buka Pesanan</Link>}
              <button type="button" className="secondary" onClick={() => setSelected(null)}>Tutup</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

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
import { cancelOrder, createOrder, fetchOrders, fetchOrder, quoteDelivery, submitPayment, type CommerceOrder, type DeliveryQuote } from "../../services/commerce";
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
  const statusText = latestOrder ? ({ pending: "Menunggu Konfirmasi", accepted: "Diproses", ready_for_pickup: latestOrder.delivery_method === "gosend" ? "Siap Diantar" : "Siap Diambil", completed: "Selesai", cancelled: "Dibatalkan" }[latestOrder.status]) : "";
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
        <section className="product-strip shop-strip">{products.slice(0, 3).map((product) => <article key={product.id}><ProductArt type={product.art} imageUrl={product.image_url} /><b>{product.name}</b><span>{money(product.price)}</span><Status>{stockLabel(product.stock)}</Status><Link to={`${base}/order?product=${product.id}`}>Pesan</Link></article>)}</section>
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
            <ProductArt type={product.art} imageUrl={product.image_url} />
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

const OPEN_DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const OPEN_DAY_LABELS: Record<string, string> = { mon: "Senin", tue: "Selasa", wed: "Rabu", thu: "Kamis", fri: "Jumat", sat: "Sabtu", sun: "Minggu" };

function hoursText(hours: StorefrontSettings["operating_hours"] | null) {
  if (!hours || !hours.open_time || !hours.close_time) return "jam operasional belum diatur admin";
  const days = OPEN_DAY_CODES.filter((day) => hours.days.includes(day)).map((day) => OPEN_DAY_LABELS[day]).join(", ");
  return `${days || "-"} pukul ${hours.open_time}–${hours.close_time}`;
}

// Cek jam buka di zona waktu koperasi (WIB). Server tetap menjadi penentu akhir.
function storeOpenNow(hours: StorefrontSettings["operating_hours"] | null) {
  if (!hours || !hours.open_time || !hours.close_time) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = pick("weekday").toLowerCase().slice(0, 3);
  const time = `${pick("hour")}:${pick("minute")}`;
  return hours.days.includes(day) && hours.open_time <= time && time <= hours.close_time;
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
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [payment, setPayment] = useState<"cash" | "qris" | "bankTransfer">("cash");
  const [paymentSettings, setPaymentSettings] = useState({ cash: true, qris: true, bank_transfer: true });
  const { session } = useAuth();
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "gosend">("pickup");
  const [hours, setHours] = useState<StorefrontSettings["operating_hours"] | null>(null);
  const [deliveryConfig, setDeliveryConfig] = useState<StorefrontSettings["delivery_settings"] | null>(null);
  const [recipient, setRecipient] = useState(session?.name ?? "");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [address, setAddress] = useState("");
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteFor, setQuoteFor] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  useEffect(() => {
    fetchStorefrontSettings().then((settings) => {
      setPaymentSettings(settings.payment_methods);
      setHours(settings.operating_hours);
      setDeliveryConfig(settings.delivery_settings);
    }).catch(() => undefined);
  }, []);
  const storeOpen = storeOpenNow(hours);
  const gosendAvailable = !!deliveryConfig?.enabled && storeOpen;
  const gosendReason = !deliveryConfig?.enabled
    ? "GoSend sedang tidak tersedia."
    : !storeOpen ? `GoSend hanya tersedia saat koperasi buka (${hoursText(hours)}).` : "";
  const isGosend = deliveryMethod === "gosend" && gosendAvailable;
  const quoteValid = !!quote && quoteFor === address.trim();
  const deliveryFee = isGosend && quoteValid && !quote?.manual_review ? (quote?.fee ?? 0) : 0;
  const changeAddress = (value: string) => { setAddress(value); setQuoteError(""); };
  const calculateFee = async () => {
    const trimmed = address.trim();
    setQuoteError("");
    if (trimmed.length < 10) { setQuoteError("Isi alamat lengkap (jalan, nomor, kelurahan/kecamatan, kota)."); return; }
    setQuoting(true);
    try {
      setQuote(await quoteDelivery(trimmed));
      setQuoteFor(trimmed);
    } catch (error) {
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : "Ongkir gagal dihitung. Coba lagi.");
    } finally {
      setQuoting(false);
    }
  };
  const methods = [
    { id: "cash" as const, title: "Tunai", description: "Bayar tunai saat pengambilan di koperasi.", symbol: "Rp", enabled: paymentSettings.cash },
    { id: "qris" as const, title: "QRIS", description: "Gunakan QRIS resmi koperasi dan tunggu verifikasi admin.", symbol: "QR", enabled: paymentSettings.qris },
    { id: "bankTransfer" as const, title: "Transfer bank", description: "Transfer ke rekening resmi koperasi dan kirim referensi pembayaran.", symbol: "TF", enabled: paymentSettings.bank_transfer },
  ].filter((method) => method.enabled && !(isGosend && method.id === "cash"));
  const selectedPayment = methods.some((method) => method.id === payment) ? payment : methods[0]?.id;
  const selected = products.filter((product) => counts[product.id]);
  const subtotal = selected.reduce((sum, product) => sum + product.price * counts[product.id], 0);
  const total = subtotal + deliveryFee;
  const deliveryReady = !isGosend || (quoteValid && recipient.trim().length > 0 && recipientPhone.replace(/\D/g, "").length >= 9);
  const change = (id: number, amount: number) => {
    const stock = products.find((product) => product.id === id)?.stock ?? 0;
    setCounts((current) => ({
      ...current,
      [id]: Math.min(stock, Math.max(0, (current[id] || 0) + amount)),
    }));
  };
  const submit = async () => {
    if (!subtotal || !selectedPayment || sent || submitting || !deliveryReady) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const order = await createOrder({
        items: selected.map((product) => ({ product_id: product.id, quantity: counts[product.id] })),
        payment_method: selectedPayment === "bankTransfer" ? "bank_transfer" : selectedPayment,
        note,
        ...(isGosend ? { delivery_method: "gosend" as const, delivery_address: address.trim(), delivery_recipient: recipient.trim(), delivery_phone: recipientPhone.trim() } : {}),
      }, requestId);
      setCreatedCode(order.code);
      setRequestId(crypto.randomUUID());
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
          <small>{isGosend ? (quoteValid ? (quote?.manual_review ? "Subtotal sementara · ongkir menyusul" : "Total Bayar (termasuk ongkir)") : "Subtotal sementara · hitung ongkir dahulu") : "Total Belanja"}</small>
          <strong>{money(total)}</strong>
        </div>
        <Icon name="bag" size={30} />
      </section>
      <h2 className="subheading">Detail Pesanan</h2>
      <section className="order-builder">
        {products.map((product) => (
          <article key={product.id}>
            <ProductArt type={product.art} imageUrl={product.image_url} />
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
      <section className="payment-section delivery-section" aria-labelledby="delivery-heading">
        <div className="payment-heading">
          <div>
            <h2 id="delivery-heading">Metode Pengambilan</h2>
            <p>Ambil sendiri di koperasi atau diantar ke alamat Anda.</p>
          </div>
          <Icon name="box" size={22} />
        </div>
        <div className="payment-method-list">
          <label className={`payment-method-card ${!isGosend ? "selected" : ""}`}>
            <input type="radio" name="delivery-method" checked={!isGosend} onChange={() => setDeliveryMethod("pickup")} disabled={sent} />
            <span className="payment-method-symbol" aria-hidden="true">🏫</span>
            <span className="payment-method-copy"><strong>Ambil di koperasi</strong><small>Gratis. Ambil saat koperasi buka setelah pesanan siap.</small></span>
            <span className="payment-method-check" aria-hidden="true">{!isGosend ? "✓" : ""}</span>
          </label>
          <label className={`payment-method-card ${isGosend ? "selected" : ""} ${!gosendAvailable ? "is-disabled" : ""}`}>
            <input type="radio" name="delivery-method" checked={isGosend} onChange={() => setDeliveryMethod("gosend")} disabled={sent || !gosendAvailable} />
            <span className="payment-method-symbol" aria-hidden="true">GO</span>
            <span className="payment-method-copy"><strong>GoSend</strong><small>{gosendAvailable ? "Diantar ke alamat Anda. Ongkir diestimasi otomatis; bila peta gagal, admin menetapkan tarif." : gosendReason}</small></span>
            <span className="payment-method-check" aria-hidden="true">{isGosend ? "✓" : ""}</span>
          </label>
        </div>
        {isGosend && (
          <div className="delivery-form">
            <div className="delivery-form__row">
              <label>Nama penerima<input value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={120} placeholder="Nama penerima" disabled={sent} /></label>
              <label>No. HP/WhatsApp penerima<input inputMode="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value.replace(/[^\d+\-\s]/g, ""))} maxLength={20} placeholder="08xxxxxxxxxx" disabled={sent} /></label>
            </div>
            <label>Alamat lengkap pengantaran<textarea value={address} onChange={(event) => changeAddress(event.target.value)} maxLength={300} placeholder="Jalan, nomor rumah, RT/RW, kelurahan, kecamatan, kota" disabled={sent} /></label>
            <button type="button" className="secondary" onClick={calculateFee} disabled={quoting || sent || address.trim().length < 10}>{quoting ? "Menghitung..." : quoteValid ? "Hitung Ulang Ongkir" : "Hitung Ongkir"}</button>
            {quoteError && <p className="payment-unavailable" role="alert">{quoteError}</p>}
            {quoteValid && quote?.manual_review && (
              <p className="payment-unavailable" role="status">
                {quote.message || "Ongkir belum dapat dihitung otomatis. Pesanan tetap bisa dibuat; admin akan menetapkan ongkir dan memberi tahu total akhir sebelum pembayaran."}
                <br />Subtotal barang saat ini: <b>{money(subtotal)}</b>. Ini belum termasuk ongkir.
              </p>
            )}
            {quoteValid && quote && !quote.manual_review && (
              <dl className="delivery-breakdown">
                <dt>Jarak (estimasi)</dt><dd>{quote.distance_km} km</dd>
                <dt>Subtotal barang</dt><dd>{money(subtotal)}</dd>
                <dt>Ongkir GoSend</dt><dd>{money(quote.fee)}</dd>
                <dt>Total bayar</dt><dd><b>{money(subtotal + quote.fee)}</b></dd>
              </dl>
            )}
            <p className="payment-help">Ongkir otomatis adalah estimasi berdasarkan jarak dan tarif koperasi. Jika alamat tidak ditemukan atau layanan peta sedang bermasalah, admin akan menetapkan ongkir manual lalu mengirim total akhir sebelum pembayaran. Pesanan GoSend dibayar lewat transfer bank atau QRIS, dan hanya dapat dibuat saat koperasi buka ({hoursText(hours)}).</p>
          </div>
        )}
      </section>
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
        {(selectedPayment === "qris" || selectedPayment === "bankTransfer") && (
          <p className="payment-help">{selectedPayment === "qris" ? "Instruksi QRIS" : "Nomor rekening"} akan ditampilkan di halaman detail pesanan setelah admin mengonfirmasi pesanan. Pembayaran dilakukan dari sana.</p>
        )}
        {selectedPayment === "cash" && (
          <p className="payment-help">Siapkan pembayaran tunai saat mengambil pesanan di koperasi.</p>
        )}
      </section>
      {sent && (
        <p className="payment-success" role="status">
          Pesanan {createdCode} berhasil dibuat. Status awal: menunggu konfirmasi admin.{selectedPayment !== "cash" ? " Info pembayaran muncul di detail pesanan setelah pesanan dikonfirmasi." : ""} Pembayaran belum dianggap lunas.
        </p>
      )}
      {submitError && <p className="payment-unavailable" role="alert">{submitError}</p>}
      {sent && createdCode ? (
        <Link className="primary wide order-submit" to={`/${role}/orders/${createdCode}`}>Lihat Detail Pesanan</Link>
      ) : (
        <button className="primary wide order-submit" disabled={!subtotal || submitting || !methods.length || !deliveryReady} onClick={submit}>
          {submitting ? "Mengirim pesanan..." : "Kirim Pesanan"}
        </button>
      )}
      {isGosend && !deliveryReady && !!subtotal && <p className="payment-help" role="status">Lengkapi nama, nomor HP, alamat, lalu tekan “Hitung Ongkir” sebelum mengirim pesanan.</p>}
      <p className="payment-disclaimer">Pemesanan ambil di koperasi dapat dilakukan kapan saja; pengambilan hanya saat koperasi buka dan pesanan berstatus siap diambil. Pesanan GoSend hanya dapat dibuat saat koperasi buka.</p>
    </>
  );
}

function orderStatusText(status: CommerceOrder["status"], method: CommerceOrder["delivery_method"] = "pickup") {
  return ({ pending: "Menunggu Konfirmasi", accepted: "Diproses", ready_for_pickup: method === "gosend" ? "Siap Diantar" : "Siap Diambil", completed: "Selesai", cancelled: "Dibatalkan" })[status];
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
            <div><b>#{order.code}</b><Status>{orderStatusText(order.status, order.delivery_method)}</Status></div>
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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [copied, setCopied] = useState(false);
  const [store, setStore] = useState<StorefrontSettings | null>(null);
  const [storeError, setStoreError] = useState("");
  const confirmCancel = async () => {
    setCancelling(true);
    setCancelError("");
    try {
      setOrder(await cancelOrder(code));
      setCancelOpen(false);
    } catch (reason) {
      setCancelError(reason instanceof Error ? reason.message : "Pesanan gagal dibatalkan.");
    } finally {
      setCancelling(false);
    }
  };
  const copyAccount = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
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
  const status = orderStatusText(order.status, order.delivery_method);
  const isGosend = order.delivery_method === "gosend";
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
        {isGosend && <div className="detail-total detail-total--sub"><span>Ongkir GoSend{order.delivery_distance_km ? ` (${order.delivery_distance_km} km)` : ""}</span><strong>{order.delivery_fee_confirmed ? money(order.delivery_fee) : "Belum ditetapkan"}</strong></div>}
        <div className="detail-total"><span>{isGosend && !order.delivery_fee_confirmed ? "Subtotal sementara (belum termasuk ongkir)" : isGosend ? "Total Bayar" : "Total Belanja"}</span><strong>{money(order.total)}</strong></div>
        <h2>{isGosend ? "Informasi Pengantaran" : "Informasi Pengambilan"}</h2>
        {isGosend
          ? <dl><dt>Metode</dt><dd>GoSend (diantar)</dd><dt>Penerima</dt><dd>{order.delivery_recipient} · {order.delivery_phone}</dd><dt>Alamat</dt><dd>{order.delivery_address}</dd><dt>Ketentuan</dt><dd>{order.delivery_fee_confirmed ? "Pesanan diantar pada jam operasional setelah pembayaran diverifikasi admin." : "Ongkir sedang ditetapkan admin. Total akhir akan dikirim melalui notifikasi sebelum pembayaran."}</dd><dt>Status</dt><dd><Status>{status}</Status></dd><dt>Pembayaran</dt><dd>{paymentStatusText(order.payment_status)}</dd></dl>
          : <dl><dt>Lokasi</dt><dd>Koperasi sekolah</dd><dt>Ketentuan</dt><dd>Ambil saat jam operasional setelah status Siap Diambil.</dd><dt>Status</dt><dd><Status>{status}</Status></dd><dt>Pembayaran</dt><dd>{paymentStatusText(order.payment_status)}</dd></dl>}
        <div className="timeline"><b>Pesanan diterima</b><span>{order.accepted_at ? "Diproses" : "Menunggu konfirmasi admin"}</span><span>{order.ready_at ? (isGosend ? "Siap diantar" : "Siap diambil") : (isGosend ? "Belum siap diantar" : "Belum siap diambil")}</span><span>{order.completed_at ? (isGosend ? "Pengantaran selesai" : "Pengambilan selesai") : (isGosend ? "Menunggu pengantaran" : "Menunggu pengambilan")}</span></div>
        {order.payment_method !== "cash" && order.payment_status !== "paid" && order.status !== "cancelled" && (
          !order.payment_info ? (
            <section className="payment-section payment-waiting"><h2>Pembayaran</h2><p>Info {order.payment_method === "qris" ? "QRIS" : "rekening"} untuk pembayaran akan muncul di sini setelah admin mengonfirmasi pesanan Anda. Anda masih dapat membatalkan pesanan sebelum membayar.</p></section>
          ) : <section className="payment-section">
            <h2>Pembayaran via {order.payment_method === "qris" ? "QRIS" : "Transfer Bank"}</h2>
            <div className="payment-info">
              <p className="payment-info__amount"><span>Total yang harus dibayar</span><strong>{money(order.total)}</strong></p>
              {order.payment_method === "bank_transfer" ? (
                order.payment_info.account_number ? (
                  <dl>
                    {order.payment_info.bank_name && <><dt>Bank</dt><dd>{order.payment_info.bank_name}</dd></>}
                    {order.payment_info.account_name && <><dt>Atas nama</dt><dd>{order.payment_info.account_name}</dd></>}
                    <dt>No. rekening</dt>
                    <dd className="payment-info__number"><b>{order.payment_info.account_number}</b><button type="button" className="secondary" onClick={() => copyAccount(order.payment_info?.account_number ?? "")}>{copied ? "Tersalin ✓" : "Salin"}</button></dd>
                  </dl>
                ) : <p className="payment-unavailable">Detail rekening belum diatur admin. Hubungi admin koperasi.</p>
              ) : order.payment_info.qris_image ? (
                <figure className="payment-info__qris">
                  <img src={order.payment_info.qris_image} alt={`QRIS pembayaran pesanan ${order.code}`} />
                  <figcaption>Scan dengan aplikasi bank atau e-wallet, lalu pastikan nominal sesuai total di atas.</figcaption>
                  <a className="secondary" href={order.payment_info.qris_image} download={`qris-${order.code}.png`}>Simpan gambar QRIS</a>
                </figure>
              ) : <p className="payment-unavailable">Gambar QRIS belum diatur admin. Hubungi admin koperasi.</p>}
            </div>
            <h3>Konfirmasi Pembayaran</h3>
            <p>Setelah membayar, isi identitas rekening atau e-wallet yang digunakan untuk transfer. Admin akan mencocokkannya dengan dana yang masuk. Ini bukan bukti pembayaran otomatis.</p><label>Nama pemilik rekening/e-wallet<input value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} placeholder="Nama sesuai akun pengirim" /></label><label>Bank atau e-wallet asal<input value={paymentSource} onChange={(event) => setPaymentSource(event.target.value)} maxLength={80} placeholder="Contoh: BCA, Mandiri, DANA, GoPay" /></label><label>4 digit terakhir rekening (opsional)<input inputMode="numeric" value={accountLast4} onChange={(event) => setAccountLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} maxLength={4} placeholder="1234" /></label><label>Catatan tambahan (opsional)<textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} maxLength={300} placeholder="Contoh: transfer pukul 14.30" /></label><button className="primary wide" disabled={!senderName.trim() || !paymentSource.trim() || (accountLast4.length > 0 && accountLast4.length !== 4) || sendingPayment || order.payment_status === "pending_verification"} onClick={sendPayment}>{sendingPayment ? "Mengirim..." : order.payment_status === "pending_verification" ? "Menunggu Verifikasi" : "Kirim Identitas Pembayaran"}</button>{paymentMessage && <p role="status">{paymentMessage}</p>}</section>
        )}
        <div className="order-detail__actions">
          <a className="secondary wide" href={`/${role}/orders/${encodeURIComponent(order.code)}/receipt`}>Cetak / Simpan Struk</a>
          <button className="primary wide" onClick={openContact}>Hubungi Admin</button>
          {order.can_cancel && <button type="button" className="secondary danger wide" onClick={() => { setCancelError(""); setCancelOpen(true); }}>Batalkan Pesanan</button>}
        </div>
        {!order.can_cancel && order.status !== "cancelled" && order.status !== "completed" && (order.payment_status === "paid" || order.payment_status === "pending_verification") && (
          <p className="order-detail__hint">{order.payment_status === "paid" ? "Pesanan yang sudah dibayar tidak dapat dibatalkan." : "Pembayaran sedang diverifikasi admin, sehingga pesanan tidak dapat dibatalkan."}</p>
        )}
      </section>
      {cancelOpen && (
        <Modal title="Batalkan Pesanan?" close={() => !cancelling && setCancelOpen(false)}>
          <div className="cancel-confirm">
            <p>Pesanan <b>#{order.code}</b> akan dibatalkan dan stok barang dikembalikan. Pesanan yang sudah dibatalkan tidak dapat diaktifkan lagi.</p>
            <p className="cancel-confirm__note">Pembatalan hanya bisa dilakukan sebelum pembayaran.</p>
            {cancelError && <p className="payment-unavailable" role="alert">{cancelError}</p>}
            <div className="cancel-confirm__actions">
              <button type="button" className="secondary" onClick={() => setCancelOpen(false)} disabled={cancelling}>Kembali</button>
              <button type="button" className="primary" onClick={confirmCancel} disabled={cancelling}>{cancelling ? "Membatalkan..." : "Ya, Batalkan"}</button>
            </div>
          </div>
        </Modal>
      )}
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

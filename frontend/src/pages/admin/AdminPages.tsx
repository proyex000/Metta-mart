import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { ALL_CATEGORIES, categories, categoryLabel, isCategoryId, type CategoryId } from "../../data/categories";
import { productService, refreshProducts, stockLabel, useProducts } from "../../services/products";
import type { Product } from "../../types";
import { adminOrderAction, adminPaymentAction, adminSetDeliveryFee, createPOSOrder, fetchAdminDashboard, fetchAdminSalesReport, fetchInventoryMovements, fetchOrders, type AdminDashboardSummary, type InventoryMovementRow, type AdminSalesReport, type CommerceOrder } from "../../services/commerce";
import { fetchStorefrontSettings, updateStorefrontSettings } from "../../services/settings";
import { broadcastNotification, fetchNotifications, markNotificationRead, type AppNotification } from "../../services/notifications";

type View = "dashboard" | "stock" | "orders" | "notifications" | "reports" | "settings";
type IconName =
  | "home"
  | "box"
  | "bag"
  | "bell"
  | "chart"
  | "settings"
  | "search"
  | "calendar"
  | "clock"
  | "users"
  | "truck"
  | "plus"
  | "edit"
  | "trash"
  | "logout"
  | "chevron"
  | "shirt";

const iconPaths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  box: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l1 13H5L6 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 20a6 6 0 0 1 12 0M15 14a5 5 0 0 1 6 5" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z" />
      <circle cx="7" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="m4 20 4-.8L19 8.2 15.8 5 4.8 16Z" />
      <path d="m14 7 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  shirt: <path d="m8 3-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0Z" />,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  const [logo, setLogo] = useState(() => localStorage.getItem("mettamart-store-logo") || "/assets/mettamart-logo.png");

  useEffect(() => {
    const syncLogo = () => setLogo(localStorage.getItem("mettamart-store-logo") || "/assets/mettamart-logo.png");
    window.addEventListener("mettamart-logo-updated", syncLogo);
    return () => window.removeEventListener("mettamart-logo-updated", syncLogo);
  }, []);

  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <img
        className="brand__image"
        src={logo}
        alt="Logo MettaMart"
      />
    </div>
  );
}

const orders = [
  {
    code: "MTM-0128",
    date: "12 Okt 2025, 09:45",
    customer: "Andi Pratama",
    total: 45000,
    status: "Menunggu Konfirmasi",
  },
  {
    code: "MTM-0127",
    date: "12 Okt 2025, 09:32",
    customer: "Siti Nurhaliza",
    total: 78000,
    status: "Diproses",
  },
  {
    code: "MTM-0126",
    date: "12 Okt 2025, 08:50",
    customer: "Budi Santoso",
    total: 120000,
    status: "Siap Diambil",
  },
  {
    code: "MTM-0125",
    date: "12 Okt 2025, 08:20",
    customer: "Citra Dewi",
    total: 62000,
    status: "Selesai",
  },
  {
    code: "MTM-0124",
    date: "12 Okt 2025, 07:55",
    customer: "Rizky Maulana",
    total: 33000,
    status: "Menunggu Konfirmasi",
  },
];

const notifications = [
  {
    title: "Pesanan #MTM-0128 telah diterima",
    text: "Pesanan Anda sedang diproses oleh admin.",
    time: "12 Okt 2025, 09:45",
    type: "Pesan",
  },
  {
    title: "Stok Buku Tulis tersedia kembali",
    text: "Buku Tulis kembali tersedia. Yuk, segera pesan!",
    time: "12 Okt 2025, 08:30",
    type: "Info",
  },
  {
    title: "Diskon 10% untuk alat tulis",
    text: "Jangan lewatkan promo spesial bulan ini!",
    time: "11 Okt 2025, 15:20",
    type: "Promo",
  },
  {
    title: "Pesanan #MTM-0126 telah dikirim",
    text: "Pesanan Anda sudah dalam perjalanan.",
    time: "10 Okt 2025, 16:30",
    type: "Pesan",
  },
  {
    title: "Terima kasih telah berbelanja!",
    text: "Semoga Anda puas dengan layanan MettaMart.",
    time: "9 Okt 2025, 14:00",
    type: "Pesan",
  },
];

const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

function ProductArt({ type, imageUrl }: { type: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return <span className="product-art product-art--photo"><img src={imageUrl} alt="Foto produk" loading="lazy" /></span>;
  }
  return (
    <span className={`product-art product-art--${type}`} aria-hidden="true">
      <i />
    </span>
  );
}

function Status({ children }: { children: ReactNode }) {
  const label = String(children);
  const tone =
    label.includes("Selesai") || label.includes("Tersedia")
      ? "green"
      : label.includes("Siap Diambil")
        ? "purple"
        : label.includes("Diproses")
          ? "blue"
          : label.includes("Habis")
            ? "red"
            : "amber";
  return <span className={`status status--${tone}`}>{children}</span>;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar__meta">
        <span className="topbar__date">
          <Icon name="calendar" size={15} /> {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
        </span>
        <span className="topbar__time">
          <Icon name="clock" size={15} /> {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="avatar" aria-label="Avatar Admin">A</span>
        <b>Admin</b>
      </div>
    </header>
  );
}

function Sidebar({ view, setView }: { view: View; setView: (view: View) => void }) {
  const nav: { id: View; label: string; icon: IconName }[] = [
    { id: "dashboard", label: "Dashboard", icon: "home" },
    { id: "stock", label: "Kelola Stok", icon: "box" },
    { id: "orders", label: "Pesanan", icon: "bag" },
    { id: "notifications", label: "Notifikasi", icon: "bell" },
    { id: "reports", label: "Laporan", icon: "chart" },
    { id: "settings", label: "Pengaturan", icon: "settings" },
  ];
  return (
    <aside className="sidebar">
      <Brand />
      <nav>
        {nav.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === "orders" && <em>5</em>}
          </button>
        ))}
      </nav>
      <div className="sidebar__account">
        <div className="avatar">A</div>
        <div>
          <b>Admin</b>
          <small>admin@mettamart.id</small>
        </div>
        <button title="Keluar">
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}

export function Dashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminDashboard()
      .then(setSummary)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Dashboard gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);

  const maxRevenue = Math.max(1, ...(summary?.daily.map((day) => day.revenue) ?? [0]));
  const statusLabel: Record<CommerceOrder["status"], string> = {
    pending: "Menunggu Konfirmasi",
    accepted: "Diproses",
    ready_for_pickup: "Siap Diambil",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };

  return (
    <>
      <Header title="Dashboard Koperasi" subtitle="Ringkasan operasional berdasarkan data aktual MettaMart." />
      {loading && <div className="panel"><p>Memuat ringkasan dari server...</p></div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {summary && <>
        <section className="stat-grid">
          {[
            { icon: "box" as IconName, label: "Produk Aktif", value: summary.products, note: "Produk di katalog" },
            { icon: "bag" as IconName, label: "Pesanan Baru", value: summary.orders_pending, note: "Menunggu konfirmasi" },
            { icon: "clock" as IconName, label: "Siap Diambil", value: summary.orders_ready, note: "Menunggu diserahkan" },
            { icon: "users" as IconName, label: "Pelanggan Aktif", value: summary.customers, note: "Siswa dan orang tua" },
          ].map((item) => (
            <article className="stat-card" key={item.label}>
              <span><Icon name={item.icon} /></span>
              <div><small>{item.label}</small><strong>{item.value.toLocaleString("id-ID")}</strong><em>{item.note}</em></div>
            </article>
          ))}
        </section>
        <section className="dashboard-grid">
          <article className="panel chart-panel">
            <div className="panel__title"><h2>Penjualan 7 Hari Terakhir</h2><strong>{money(summary.today_revenue)} hari ini</strong></div>
            {summary.daily.every((day) => day.revenue === 0) ? (
              <p className="table-foot">Belum ada transaksi lunas yang selesai dalam 7 hari terakhir.</p>
            ) : (
              <div className="bar-chart">
                {summary.daily.map((day) => (
                  <div key={day.date} title={`${money(day.revenue)} · ${day.orders} transaksi`}>
                    <i style={{ height: `${Math.max(4, day.revenue / maxRevenue * 100)}%` }} />
                    <small>{new Date(`${day.date}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short" })}</small>
                  </div>
                ))}
              </div>
            )}
          </article>
          <article className="panel latest">
            <div className="panel__title"><h2>Pesanan Terbaru</h2><button onClick={() => window.location.assign("/admin/orders")}>Lihat Semua ›</button></div>
            <div className="latest__list">
            {summary.recent_orders.length ? summary.recent_orders.map((order) => (
              <div className="latest__row" key={order.code}>
                <span className="mini-icon"><Icon name="bag" size={16} /></span>
                <div><b>#{order.code}</b><small>{order.beneficiary_name ? `Untuk ${order.beneficiary_name} · ` : ""}{order.customer_name} · {new Date(order.created_at).toLocaleString("id-ID")}</small></div>
                <Status>{order.delivery_method === "gosend" && order.status === "ready_for_pickup" ? "Siap Diantar" : statusLabel[order.status]}</Status>
                <span>{money(order.total)}</span>
              </div>
            )) : <p className="table-foot">Belum ada pesanan.</p>}
            </div>
          </article>
        </section>
        <section className="panel table-panel">
          <div className="panel__title"><h2>Perhatian Stok</h2><small>Produk dengan stok kurang dari 10 unit</small></div>
          {summary.low_stock.length ? (
            <div className="top-products-list">
              {summary.low_stock.map((product) => (
                <div key={product.id}><span><b>{product.name}</b><small>Perlu diperiksa atau ditambah</small></span><strong>{product.stock} unit</strong></div>
              ))}
            </div>
          ) : <p className="table-foot">Tidak ada produk dengan stok menipis.</p>}
        </section>
      </>}
    </>
  );
}

type ProductForm = { name: string; category: CategoryId; price: string; stock: string; stockNote: string };
const emptyProductForm: ProductForm = {
  name: "",
  category: categories[0].id,
  price: "",
  stock: "",
  stockNote: "",
};
type StockFilter = "Semua Stok" | "Tersedia" | "Hampir Habis" | "Habis";

export function Stock() {
  const items = useProducts();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | typeof ALL_CATEGORIES>(ALL_CATEGORIES);
  const [stockFilter, setStockFilter] = useState<StockFilter>("Semua Stok");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProductForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const imagePreview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : null, [imageFile]);
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  const [error, setError] = useState("");
  const [movements, setMovements] = useState<InventoryMovementRow[]>([]);
  const [movementError, setMovementError] = useState("");
  const reloadMovements = () => fetchInventoryMovements().then(setMovements).catch((reason) => setMovementError(reason instanceof Error ? reason.message : "Riwayat stok gagal dimuat."));
  useEffect(() => { reloadMovements(); }, []);
  const filtered = items.filter((p) => {
    const needle = query.trim().toLowerCase();
    return (
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        categoryLabel(p.category).toLowerCase().includes(needle)) &&
      (category === ALL_CATEGORIES || p.category === category) &&
      (stockFilter === "Semua Stok" || stockLabel(p.stock) === stockFilter)
    );
  });
  const openNew = () => {
    setForm(emptyProductForm);
    setImageFile(null);
    setRemoveImage(false);
    setError("");
    setEditing("new");
  };
  const openEdit = (product: Product) => {
    setImageFile(null);
    setRemoveImage(false);
    setForm({
      name: product.name,
      category: product.category,
      price: String(product.price),
      stock: String(product.stock),
      stockNote: "",
    });
    setError("");
    setEditing(product);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (form.price.trim() === "" || form.stock.trim() === "") {
      setError("Harga dan stok wajib diisi.");
      return;
    }
    if (editing !== "new" && Number(form.stock) !== editing.stock && !form.stockNote.trim()) {
      setError("Isi alasan perubahan stok untuk mencatat riwayat persediaan.");
      return;
    }
    const input = {
      name: form.name,
      category: form.category,
      price: Number(form.price),
      stock: Number(form.stock),
      stock_note: form.stockNote,
      image_file: imageFile,
      remove_image: removeImage,
    };
    try {
      if (editing === "new") await productService.create(input);
      else await productService.update(editing.id, input);
      setImageFile(null);
      setRemoveImage(false);
      setEditing(null);
      await reloadMovements();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Produk gagal disimpan.");
    }
  };
  return (
    <>
      <Header title="Kelola Stok" subtitle="Atur dan kelola stok produk di MettaMart." />
      <div className="panel table-panel">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama produk..."
            />
          </label>
          <select
            aria-label="Filter kategori"
            value={category}
            onChange={(e) =>
              setCategory(isCategoryId(e.target.value) ? e.target.value : ALL_CATEGORIES)
            }
          >
            <option value={ALL_CATEGORIES}>Semua Kategori</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter stok"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as StockFilter)}
          >
            <option>Semua Stok</option>
            <option>Tersedia</option>
            <option>Hampir Habis</option>
            <option>Habis</option>
          </select>
          <button className="primary" onClick={openNew}>
            <Icon name="plus" size={16} /> Tambah Produk
          </button>
        </div>
        <div className="desktop-table">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Gambar</th>
                <th>Nama Produk</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Stok</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>
                    <ProductArt type={p.art} imageUrl={p.image_url} />
                  </td>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>{categoryLabel(p.category)}</td>
                  <td>{money(p.price)}</td>
                  <td className={p.stock < 10 ? "danger" : ""}>{p.stock}</td>
                  <td>
                    <Status>{stockLabel(p.stock)}</Status>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Ubah ${p.name}`}
                      onClick={() => openEdit(p)}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Hapus ${p.name}`}
                      onClick={async () => {
                        if (window.confirm(`Hapus produk "${p.name}"? Jika produk memiliki riwayat stok atau transaksi, sistem akan menonaktifkannya agar catatan lama tetap aman.`)) {
                          try { await productService.remove(p.id); }
                          catch (reason) { window.alert(reason instanceof Error ? reason.message : "Produk gagal dihapus. Periksa koneksi dan coba lagi."); }
                        }
                      }}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="table-foot">
          Menampilkan {filtered.length} dari {items.length} produk
        </p>
      </div>
      <section className="panel table-panel">
        <div className="panel__title"><h2>Riwayat Pergerakan Stok</h2><small>Catatan perubahan stok terbaru</small></div>
        {movementError && <p className="auth-error" role="alert">{movementError}</p>}
        {!movements.length && !movementError && <p className="table-foot">Belum ada pergerakan stok.</p>}
        {movements.length > 0 && <div className="desktop-table"><table><thead><tr><th>Waktu</th><th>Produk</th><th>Perubahan</th><th>Jenis</th><th>Referensi</th><th>Admin</th></tr></thead><tbody>
          {movements.slice(0, 20).map((movement) => <tr key={movement.id}><td>{new Date(movement.created_at).toLocaleString("id-ID")}</td><td>{movement.product_name}</td><td className={movement.quantity_delta < 0 ? "danger" : ""}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}</td><td>{{ initial_stock: "Stok awal", manual_adjustment: "Penyesuaian", order_reserved: "Pesanan online", order_cancelled: "Pembatalan", pos_sale: "Penjualan POS" }[movement.reason]}</td><td>{movement.reference || "—"}</td><td>{movement.actor_name || "Sistem"}</td></tr>)}
        </tbody></table></div>}
      </section>
      {editing && (
        <Modal title={editing === "new" ? "Tambah Produk" : "Ubah Produk"} close={() => setEditing(null)}>
          <form onSubmit={save} noValidate>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <label>
              Nama Produk
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Kemeja Seragam"
              />
            </label>
            <section className="product-image-field" aria-labelledby="product-image-heading">
              <div className="product-image-field__heading">
                <div>
                  <h3 id="product-image-heading">Foto produk <span>Opsional</span></h3>
                  <p>Tambahkan foto agar produk lebih mudah dikenali pelanggan.</p>
                </div>
                <span className="product-image-field__format">JPG · PNG · WEBP</span>
              </div>
              <div className="product-image-field__body">
                <div className="product-image-field__preview">
                  {imagePreview || (editing !== "new" && !removeImage ? editing.image_url : null)
                    ? <img src={imagePreview || (editing !== "new" && !removeImage ? editing.image_url || "" : "")} alt="Pratinjau foto produk" />
                    : <div className="product-image-field__empty"><span aria-hidden="true">▧</span><b>Belum ada foto</b><small>Pratinjau foto produk</small></div>}
                </div>
                <div className="product-image-field__controls">
                  <label className="product-image-field__choose" htmlFor="product-image-upload">
                    <span aria-hidden="true">＋</span>
                    {imagePreview || (editing !== "new" && editing.image_url && !removeImage) ? "Ganti foto" : "Pilih foto"}
                  </label>
                  <input
                    id="product-image-upload"
                    className="product-image-field__input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && file.size > 5 * 1024 * 1024) {
                        setError("Ukuran gambar maksimal 5 MB.");
                        event.target.value = "";
                        return;
                      }
                      setImageFile(file);
                      setRemoveImage(false);
                      setError("");
                    }}
                  />
                  <small className="product-image-field__hint">Maksimal 5 MB. Gunakan foto yang jelas dan tidak buram.</small>
                  {imageFile && <span className="product-image-field__filename" title={imageFile.name}>{imageFile.name}</span>}
                  {editing !== "new" && editing.image_url && !imageFile && (
                    <label className="product-image-field__remove">
                      <input type="checkbox" checked={removeImage} onChange={(event) => setRemoveImage(event.target.checked)} />
                      Hapus foto produk
                    </label>
                  )}
                </div>
              </div>
            </section>
            <div className="form-row">
              <label>
                Kategori
                <select
                  value={form.category}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (isCategoryId(next)) setForm({ ...form, category: next });
                  }}
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Stok
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </label>
            </div>
            <label>
              Harga (Rp)
              <input
                type="number"
                min={0}
                step={1}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label>
              Alasan perubahan stok (wajib jika stok berubah)
              <input value={form.stockNote} maxLength={80} onChange={(e) => setForm({ ...form, stockNote: e.target.value })} placeholder="Contoh: barang masuk dari pemasok" />
            </label>
            <button className="primary wide">Simpan Produk</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function adminOrderStatus(status: CommerceOrder["status"], method: CommerceOrder["delivery_method"] = "pickup") {
  return ({ pending: "Menunggu Konfirmasi", accepted: "Diproses", ready_for_pickup: method === "gosend" ? "Siap Diantar" : "Siap Diambil", completed: "Selesai", cancelled: "Dibatalkan" })[status];
}
function deliveryLabel(method: CommerceOrder["delivery_method"]) {
  return method === "gosend" ? "GoSend" : "Ambil di koperasi";
}
function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("62") ? digits : digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${full}`;
}
function adminPaymentStatus(status: CommerceOrder["payment_status"]) {
  return ({ unpaid: "Belum Dibayar", pending_verification: "Menunggu Verifikasi", paid: "Lunas", failed: "Ditolak", refunded: "Dikembalikan" })[status];
}

export function Orders() {
  const [tab, setTab] = useState("Semua");
  const [items, setItems] = useState<CommerceOrder[]>([]);
  const [selected, setSelected] = useState<CommerceOrder | null>(null);
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState("0");
  const tabs = ["Semua", "Menunggu Konfirmasi", "Diproses", "Siap Diambil", "Selesai", "Dibatalkan"];
  const reload = async () => { const data = await fetchOrders(); setItems(data); };
  useEffect(() => {
    reload().catch((reason) => setError(reason instanceof Error ? reason.message : "Pesanan gagal dimuat.")).finally(() => setLoading(false));
  }, []);
  const shown = items.filter((order) => {
    const date = new Date(order.created_at).toLocaleDateString("en-CA");
    const needle = query.trim().toLowerCase();
    return (tab === "Semua" || adminOrderStatus(order.status) === tab)
      && (!needle || order.code.toLowerCase().includes(needle) || order.customer_name.toLowerCase().includes(needle) || (order.beneficiary_name || "").toLowerCase().includes(needle))
      && (paymentFilter === "all" || order.payment_status === paymentFilter)
      && (methodFilter === "all" || order.payment_method === methodFilter)
      && (channelFilter === "all" || order.sales_channel === channelFilter)
      && (deliveryFilter === "all" || order.delivery_method === deliveryFilter)
      && (!dateFrom || date >= dateFrom)
      && (!dateTo || date <= dateTo);
  });
  const exportCsv = () => {
    const escapeCell = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replace(/"/g, '""') + '"';
    };
    const rows = [
      ["Kode", "Tanggal", "Pelanggan", "Penerima", "Kanal", "Metode", "Status Pesanan", "Status Pembayaran", "Total", "Nama Pengirim", "Bank/E-wallet", "Akhir Rekening", "Pengambilan", "Ongkir", "Penerima Antar", "HP Penerima", "Alamat Antar"],
      ...shown.map((order) => [order.code, new Date(order.created_at).toLocaleString("id-ID"), order.customer_name, order.beneficiary_name || "", order.sales_channel, order.payment_method, adminOrderStatus(order.status, order.delivery_method), adminPaymentStatus(order.payment_status), order.total, order.payment_sender_name, order.payment_source, order.payment_account_last4, deliveryLabel(order.delivery_method), order.delivery_fee, order.delivery_recipient, order.delivery_phone, order.delivery_address]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mettamart-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const act = async (action: "accept" | "ready" | "complete-pickup" | "cancel") => {
    if (!selected || working) return;
    setWorking(true); setError("");
    try {
      const updated = await adminOrderAction(selected.code, action);
      setSelected(updated);
      setItems((current) => current.map((item) => item.code === updated.code ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status pesanan gagal diperbarui.");
    } finally { setWorking(false); }
  };
  const saveDeliveryFee = async () => {
    if (!selected || working) return;
    const fee = Number(deliveryFeeInput);
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > 1_000_000) {
      setError("Ongkir harus bilangan bulat antara Rp0 dan Rp1.000.000.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const updated = await adminSetDeliveryFee(selected.code, fee);
      setSelected(updated);
      setItems((current) => current.map((item) => item.code === updated.code ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ongkir gagal disimpan.");
    } finally {
      setWorking(false);
    }
  };
  const verify = async (action: "verify" | "reject") => {
    if (!selected || working) return;
    setWorking(true); setError("");
    try {
      const updated = await adminPaymentAction(selected.code, action);
      setSelected(updated);
      setItems((current) => current.map((item) => item.code === updated.code ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status pembayaran gagal diperbarui.");
    } finally { setWorking(false); }
  };
  return (
    <>
      <Header title="Pesanan" subtitle="Terima pesanan, siapkan barang, dan konfirmasi pengambilan atau pengantaran GoSend." />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="panel table-panel">
        <div className="tabs">{tabs.map((t) => <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>{t}{t === "Semua" ? ` (${items.length})` : ""}</button>)}</div>
        <div className="orders-toolbar">
          <label className="search order-search">
            <Icon name="search" size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode pesanan, pelanggan, atau penerima..." />
          </label>
          <section className="orders-toolbar__filter-group" aria-label="Filter pesanan">
            <div className="orders-toolbar__section-heading">
              <b>Filter transaksi</b>
              <span>Persempit daftar pesanan berdasarkan kategori</span>
            </div>
            <div className="orders-toolbar__selects">
              <label className="orders-toolbar__field"><span>Status pembayaran</span>
                <select aria-label="Filter status pembayaran" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="all">Semua Pembayaran</option><option value="unpaid">Belum Dibayar</option><option value="pending_verification">Menunggu Verifikasi</option><option value="paid">Lunas</option><option value="failed">Ditolak</option></select>
              </label>
              <label className="orders-toolbar__field"><span>Metode pembayaran</span>
                <select aria-label="Filter metode pembayaran" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="all">Semua Metode</option><option value="cash">Tunai</option><option value="bank_transfer">Transfer</option><option value="qris">QRIS</option></select>
              </label>
              <label className="orders-toolbar__field"><span>Kanal transaksi</span>
                <select aria-label="Filter kanal transaksi" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="all">Semua Kanal</option><option value="online">Online</option><option value="pos">POS</option></select>
              </label>
              <label className="orders-toolbar__field"><span>Pengambilan</span>
                <select aria-label="Filter metode pengambilan" value={deliveryFilter} onChange={(event) => setDeliveryFilter(event.target.value)}><option value="all">Semua Pengambilan</option><option value="pickup">Ambil di Koperasi</option><option value="gosend">GoSend</option></select>
              </label>
            </div>
          </section>
          <div className="orders-toolbar__bottom">
            <div className="orders-toolbar__date-group">
              <div className="orders-toolbar__section-heading">
                <b>Periode transaksi</b>
                <span>Atur tanggal awal dan akhir</span>
              </div>
              <div className="orders-toolbar__dates">
                <label className="orders-toolbar__field"><span>Dari tanggal</span><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
                <label className="orders-toolbar__field"><span>Sampai tanggal</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
              </div>
            </div>
            <button className="secondary orders-toolbar__export" type="button" onClick={exportCsv} disabled={!shown.length}>
              <Icon name="chart" size={16} /> Ekspor CSV <span>({shown.length})</span>
            </button>
          </div>
        </div>
        {loading ? <p>Memuat pesanan...</p> : (
          <div className="desktop-table"><table><thead><tr><th>No</th><th>Kode Pesanan</th><th>Tanggal</th><th>Pelanggan</th><th>Total</th><th>Pengambilan</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>{shown.map((order, index) => <tr key={order.code}><td>{index + 1}</td><td><b>{order.code}</b></td><td>{new Date(order.created_at).toLocaleString("id-ID")}</td><td>{order.customer_name}</td><td><b>{order.delivery_method === "gosend" && !order.delivery_fee_confirmed ? "Ongkir belum diatur" : money(order.total)}</b></td><td><span className={`delivery-badge delivery-badge--${order.delivery_method}`}>{deliveryLabel(order.delivery_method)}</span></td><td><Status>{adminOrderStatus(order.status, order.delivery_method)}</Status></td><td><button className="primary small" onClick={() => { setDeliveryFeeInput(String(order.delivery_fee ?? 0)); setSelected(order); }}>Detail</button></td></tr>)}</tbody>
          </table></div>
        )}
        {!loading && !shown.length && <p className="table-foot">Tidak ada pesanan pada filter ini.</p>}
        <p className="table-foot">Total {shown.length} pesanan</p>
      </div>
      {selected && (
        <Modal title={`Detail ${selected.code}`} close={() => setSelected(null)}>
          <div className="admin-order-detail">
            <p><span>Pelanggan</span><b>{selected.customer_name}</b></p>
            {selected.beneficiary_name && <p><span>Untuk Siswa</span><b>{selected.beneficiary_name}</b></p>}
            <p><span>Tanggal</span><b>{new Date(selected.created_at).toLocaleString("id-ID")}</b></p>
            <p><span>{selected.delivery_method === "gosend" && !selected.delivery_fee_confirmed ? "Subtotal sementara" : "Total"}</span><b>{money(selected.total)}</b></p>
            <p><span>Status Pesanan</span><Status>{adminOrderStatus(selected.status, selected.delivery_method)}</Status></p>
            <p><span>Pengambilan</span><span className={`delivery-badge delivery-badge--${selected.delivery_method}`}>{deliveryLabel(selected.delivery_method)}</span></p>
            {selected.delivery_method === "gosend" && (
              <div className="delivery-info">
                <h3>Alamat Pengantaran GoSend</h3>
                <p><span>Penerima</span><b>{selected.delivery_recipient}</b></p>
                <p><span>No. HP/WA</span><b><a href={whatsappLink(selected.delivery_phone)} target="_blank" rel="noopener noreferrer">{selected.delivery_phone}</a></b></p>
                <p><span>Alamat</span><b>{selected.delivery_address}</b></p>
                <p><span>Jarak (estimasi)</span><b>{selected.delivery_distance_km ? `${selected.delivery_distance_km} km` : "-"}</b></p>
                <p><span>Ongkir</span><b>{selected.delivery_fee_confirmed ? money(selected.delivery_fee) : "Menunggu penetapan admin"}</b></p>
                {!selected.delivery_fee_confirmed && <section className="panel delivery-fee-editor"><h3>Tetapkan Ongkir Manual</h3><p>Pastikan alamat dapat dijangkau. Setelah disimpan, total akhir dikirim melalui notifikasi pelanggan. Pesanan belum dapat diterima atau dibayar sebelum ongkir ditetapkan.</p><label>Ongkir final (Rp)<input type="number" min="0" max="1000000" step="1" value={deliveryFeeInput} onChange={(event) => setDeliveryFeeInput(event.target.value)} /></label><button type="button" className="primary" disabled={working} onClick={saveDeliveryFee}>{working ? "Menyimpan..." : "Simpan Ongkir & Beri Tahu Pelanggan"}</button></section>}
                <a className="secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.delivery_address)}`} target="_blank" rel="noopener noreferrer">Buka di Google Maps</a>
              </div>
            )}
            <p><span>Metode Pembayaran</span><b>{selected.payment_method === "bank_transfer" ? "Transfer Bank" : selected.payment_method === "qris" ? "QRIS" : "Tunai"}</b></p>
            <p><span>Status Pembayaran</span><b>{adminPaymentStatus(selected.payment_status)}</b></p>
            {selected.payment_method !== "cash" && selected.payment_sender_name && <><p><span>Nama Pengirim</span><b>{selected.payment_sender_name}</b></p><p><span>Bank / E-wallet Asal</span><b>{selected.payment_source}</b></p>{selected.payment_account_last4 && <p><span>4 Digit Akhir Rekening</span><b>•••• {selected.payment_account_last4}</b></p>}</>}
            <div className="form-row"><a className="primary" href={`/admin/orders/${encodeURIComponent(selected.code)}/receipt`}>Cetak / Simpan Struk</a></div>
            <h3>Rincian Barang</h3>
            {selected.items.map((item) => <p key={item.product_id}><span>{item.product_name} × {item.quantity}</span><b>{money(item.line_total)}</b></p>)}
            {selected.delivery_method === "gosend" && <p><span>Ongkir GoSend</span><b>{money(selected.delivery_fee)}</b></p>}
            {selected.note && <p><span>Catatan</span><b>{selected.note}</b></p>}
            {selected.payment_status === "pending_verification" && <div className="form-row"><button className="primary" disabled={working} onClick={() => verify("verify")}>Verifikasi Pembayaran</button><button className="secondary" disabled={working} onClick={() => verify("reject")}>Tolak Pembayaran</button></div>}
            <div className="form-row">
              {selected.status === "pending" && (selected.delivery_method !== "gosend" || selected.delivery_fee_confirmed) && <button className="primary" disabled={working} onClick={() => act("accept")}>Terima Pesanan</button>}
              {selected.status === "accepted" && <button className="primary" disabled={working} onClick={() => act("ready")}>{selected.delivery_method === "gosend" ? "Tandai Siap Diantar" : "Tandai Siap Diambil"}</button>}
              {selected.status === "ready_for_pickup" && <button className="primary" disabled={working} onClick={() => act("complete-pickup")}>{selected.delivery_method === "gosend" ? "Konfirmasi Pengantaran" : "Konfirmasi Pengambilan"}</button>}
              {["pending", "accepted"].includes(selected.status) && <button className="secondary" disabled={working} onClick={() => act("cancel")}>Batalkan Pesanan</button>}
            </div>
            <button className="primary wide" onClick={() => setSelected(null)}>Tutup Detail</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Notifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState("");
  const [selectedNotice, setSelectedNotice] = useState<AppNotification | null>(null);
  useEffect(() => {
    fetchNotifications().then(setItems)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Notifikasi gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);
  const markRead = async (notice: AppNotification) => {
    if (notice.is_read) return;
    try {
      await markNotificationRead(notice.id);
      setItems((current) => current.map((item) => item.id === notice.id ? { ...item, is_read: true } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Notifikasi gagal diperbarui.");
    }
  };
  const openNotice = (notice: AppNotification) => {
    setSelectedNotice({ ...notice, is_read: true });
    void markRead(notice);
  };
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !message.trim() || sending) return;
    setSending(true); setError(""); setSentMessage("");
    try {
      const result = await broadcastNotification({ title: title.trim(), message: message.trim(), kind: "announcement" });
      setSentMessage(`Pengumuman berhasil dikirim ke ${result.sent_to} akun siswa dan orang tua.`);
      setTitle(""); setMessage("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pengumuman gagal dikirim.");
    } finally { setSending(false); }
  };
  return (
    <>
      <Header title="Notifikasi" subtitle="Pantau aktivitas pesanan dan kirim pengumuman kepada siswa serta orang tua." />
      {error && <p className="auth-error" role="alert">{error}</p>}
      <section className="panel table-panel">
        <div className="panel__title"><h2>Kirim Pengumuman</h2></div>
        <form className="notification-compose" onSubmit={send}>
          <label>Judul<input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} required placeholder="Contoh: Jadwal koperasi selama ujian" /></label>
          <label>Pesan<textarea value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} required placeholder="Tulis informasi untuk siswa dan orang tua." /></label>
          <button className="primary" type="submit" disabled={sending || !title.trim() || !message.trim()}>{sending ? "Mengirim..." : "Kirim ke Siswa & Orang Tua"}</button>
          {sentMessage && <p role="status">{sentMessage}</p>}
        </form>
      </section>
      <section className="panel table-panel">
        <div className="panel__title"><h2>Aktivitas Notifikasi Admin</h2><small>Pesanan dan pembayaran</small></div>
        {loading && <p>Memuat...</p>}
        {!loading && !items.length && <p className="table-foot">Belum ada aktivitas notifikasi.</p>}
        <div className="shop-notices">
          {items.map((notice) => (
            <button type="button" className={notice.is_read ? "read" : ""} key={notice.id} onClick={() => openNotice(notice)} aria-label={`Lihat detail: ${notice.title}`}>
              <span className="mini-icon"><Icon name={notice.kind === "payment" ? "bag" : "bell"} /></span>
              <div><b>{notice.title}</b><p>{notice.message}</p><time>{new Date(notice.created_at).toLocaleString("id-ID")}</time></div>
              <span className="notice-detail-chip">Detail</span>
            </button>
          ))}
        </div>
      </section>
      {selectedNotice && (
        <Modal title="Detail Notifikasi" close={() => setSelectedNotice(null)}>
          <div className="notice-detail">
            <div className="notice-detail__meta">
              <span className="mini-icon"><Icon name={selectedNotice.kind === "payment" ? "bag" : "bell"} /></span>
              <div>
                <span className="notice-detail__kind">{({ order: "Pesanan", payment: "Pembayaran", stock: "Stok", announcement: "Pengumuman" } as Record<string, string>)[selectedNotice.kind] || "Informasi"}</span>
                <time>{new Date(selectedNotice.created_at).toLocaleString("id-ID")}</time>
              </div>
            </div>
            <h3>{selectedNotice.title}</h3>
            <p>{selectedNotice.message}</p>
            {selectedNotice.target_code && <dl><dt>Pesanan terkait</dt><dd>#{selectedNotice.target_code}</dd></dl>}
            <button type="button" className="secondary" onClick={() => setSelectedNotice(null)}>Tutup</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Reports() {
  const [report, setReport] = useState<AdminSalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAdminSalesReport()
      .then(setReport)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Laporan gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);

  const maxDailyRevenue = Math.max(1, ...(report?.daily.map((day) => day.total) ?? [0]));
  const periodLabel = report
    ? `${new Date(`${report.period.from}T00:00:00`).toLocaleDateString("id-ID")} – ${new Date(`${report.period.to}T00:00:00`).toLocaleDateString("id-ID")}`
    : "";

  return (
    <>
      <Header title="Laporan" subtitle="Ringkasan penjualan dari pesanan yang sudah selesai dan pembayarannya lunas." />
      {loading && <div className="panel"><p>Memuat laporan dari server...</p></div>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      {report && (
        <>
          <section className="report-summary">
            <article>
              <span className="mini-icon"><Icon name="chart" /></span>
              <div><small>Penjualan Hari Ini</small><strong>{money(report.today.revenue)}</strong><em>{report.today.orders} transaksi selesai</em></div>
            </article>
            <article>
              <span className="mini-icon"><Icon name="bag" /></span>
              <div><small>Penjualan Bulan Ini</small><strong>{money(report.month.revenue)}</strong><em>{report.month.orders} transaksi lunas</em></div>
            </article>
            <article>
              <span className="mini-icon"><Icon name="bag" /></span>
              <div><small>Rata-rata Transaksi Bulan Ini</small><strong>{money(report.month.average_order)}</strong><em>Per transaksi selesai</em></div>
            </article>
          </section>
          <section className="report-grid">
            <article className="panel">
              <div className="panel__title"><h2>Penjualan 7 Hari Terakhir</h2><small>{periodLabel}</small></div>
              {report.daily.every((day) => day.total === 0) ? (
                <p className="table-foot">Belum ada penjualan selesai dalam 7 hari terakhir.</p>
              ) : (
                <div className="bar-chart">
                  {report.daily.map((day) => (
                    <div key={day.date} title={`${money(day.total)} · ${day.orders} transaksi`}>
                      <i style={{ height: `${Math.max(4, day.total / maxDailyRevenue * 100)}%` }} />
                      <small>{new Date(`${day.date}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short" })}</small>
                    </div>
                  ))}
                </div>
              )}
            </article>
            <article className="panel">
              <div className="panel__title"><h2>Produk Terlaris Bulan Ini</h2></div>
              {report.top_products.length ? (
                <div className="top-products-list">
                  {report.top_products.map((product) => (
                    <div key={product.product_name}>
                      <span><b>{product.product_name}</b><small>{product.quantity} unit terjual</small></span>
                      <strong>{money(product.revenue)}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="table-foot">Belum ada produk terjual pada periode ini.</p>}
            </article>
          </section>
          <p className="table-foot">Laporan hanya menghitung pesanan yang sudah dikonfirmasi selesai dan berstatus lunas. Pesanan dibatalkan atau belum diambil tidak dihitung sebagai penjualan.</p>
        </>
      )}
    </>
  );
}

export function POS() {
  const products = useProducts();
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "qris">("cash");
  const [enabled, setEnabled] = useState({ cash: true, bank_transfer: true, qris: true });
  const [note, setNote] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<CommerceOrder | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState("");
  useEffect(() => {
    fetchStorefrontSettings().then((settings) => {
      setEnabled(settings.payment_methods);
      if (!settings.payment_methods[paymentMethod]) {
        const first = (["cash", "bank_transfer", "qris"] as const).find((method) => settings.payment_methods[method]);
        if (first) setPaymentMethod(first);
      }
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Pengaturan pembayaran gagal dimuat."));
  }, []);
  const selected = products.filter((product) => (counts[product.id] || 0) > 0);
  const total = selected.reduce((sum, product) => sum + product.price * counts[product.id], 0);
  const keyword = search.trim().toLowerCase();
  const visibleProducts = keyword ? products.filter((product) => product.name.toLowerCase().includes(keyword)) : products;
  const change = (id: number, delta: number) => {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    setCounts((current) => ({ ...current, [id]: Math.min(product.stock, Math.max(0, (current[id] || 0) + delta)) }));
    setReceipt(null);
  };
  const checkout = async () => {
    if (!selected.length || working) return;
    setWorking(true); setError("");
    try {
      const order = await createPOSOrder({
        items: selected.map((product) => ({ product_id: product.id, quantity: counts[product.id] })),
        payment_method: paymentMethod,
        note,
        ...(paymentMethod === "cash" ? { cash_received: Number(cashReceived) } : {}),
      }, requestId);
      setReceipt(order); setCounts({}); setNote(""); setCashReceived(""); setRequestId(crypto.randomUUID());
      await refreshProducts();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Transaksi POS gagal disimpan.");
    } finally { setWorking(false); }
  };
  return (
    <>
      <Header title="POS Koperasi" subtitle="Transaksi langsung oleh admin saat melayani pembelian di koperasi." />
      <div className="pos-layout">
        <section className="panel table-panel pos-products">
          <div className="panel__title"><h2>Pilih Produk</h2><small>Stok diperbarui dari server</small></div>
          <label className="search pos-search">
            <Icon name="search" size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama produk..." aria-label="Cari produk" />
          </label>
          <div className="pos-product-list">
            {visibleProducts.map((product) => (
              <article key={product.id} className={counts[product.id] ? "is-selected" : ""}>
                <div><b>{product.name}</b><small>{money(product.price)} · Stok {product.stock}</small></div>
                <div className="quantity">
                  <button type="button" onClick={() => change(product.id, -1)} disabled={!counts[product.id]} aria-label={`Kurangi ${product.name}`}>−</button>
                  <b>{counts[product.id] || 0}</b>
                  <button type="button" onClick={() => change(product.id, 1)} disabled={counts[product.id] >= product.stock || product.stock === 0} aria-label={`Tambah ${product.name}`}>+</button>
                </div>
              </article>
            ))}
            {!products.length && <p className="table-foot">Belum ada produk aktif.</p>}
            {!!products.length && !visibleProducts.length && <p className="table-foot">Tidak ada produk yang cocok dengan “{search.trim()}”.</p>}
          </div>
        </section>
        <section className="panel table-panel pos-summary">
          <div className="panel__title"><h2>Ringkasan Transaksi</h2>{selected.length > 0 && <small>{selected.length} produk</small>}</div>
          <div className="pos-summary__items">
            {selected.map((product) => <div className="pos-summary__item" key={product.id}><div><b>{product.name}</b><small>{counts[product.id]} × {money(product.price)}</small></div><strong>{money(counts[product.id] * product.price)}</strong></div>)}
            {!selected.length && <p className="pos-summary__empty">Pilih produk untuk memulai transaksi.</p>}
          </div>
          <div className="pos-summary__total"><span>Total</span><strong>{money(total)}</strong></div>
          <div className="pos-summary__fields">
            <label>Metode Pembayaran<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)}>{enabled.cash && <option value="cash">Tunai</option>}{enabled.bank_transfer && <option value="bank_transfer">Transfer Bank (dikonfirmasi admin)</option>}{enabled.qris && <option value="qris">QRIS (dikonfirmasi admin)</option>}</select></label>
            {paymentMethod === "cash" && <>
              <label>Uang Diterima (Rp)<input type="number" min={total} step={1} value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder={String(total)} /></label>
              <div className="pos-summary__change"><span>Kembalian</span><b>{money(Math.max(0, Number(cashReceived || 0) - total))}</b></div>
            </>}
            <label>Catatan (opsional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Catatan transaksi" /></label>
          </div>
          <button className="primary wide" disabled={!selected.length || !total || working || !enabled[paymentMethod] || (paymentMethod === "cash" && (!cashReceived || Number(cashReceived) < total))} onClick={checkout}>{working ? "Menyimpan transaksi..." : "Selesaikan & Simpan Transaksi"}</button>
          <p className="pos-summary__hint">Catat transaksi langsung saat pembelian di koperasi. Pastikan pembayaran telah diterima sebelum transaksi diselesaikan.</p>
        </section>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {receipt && (
        <section className="panel table-panel pos-receipt">
          <div className="panel__title"><h2>Transaksi Berhasil</h2><span className="status">Selesai · Lunas</span></div>
          <dl>
            <dt>Kode</dt><dd>{receipt.code}</dd>
            <dt>Total</dt><dd>{money(receipt.total)}</dd>
            {receipt.cash_received !== null && <><dt>Uang diterima</dt><dd>{money(receipt.cash_received)}</dd><dt>Kembalian</dt><dd>{money(receipt.change_due || 0)}</dd></>}
          </dl>
          <div className="form-row"><a className="primary" href={`/admin/orders/${encodeURIComponent(receipt.code)}/receipt`}>Cetak / Simpan Struk</a><button className="secondary" onClick={() => setReceipt(null)}>Tutup Bukti Transaksi</button></div>
        </section>
      )}
    </>
  );
}

export function Settings() {
  const { session, updateProfile } = useAuth();
  type SettingsTab = "store" | "account" | "payment" | "pickup" | "delivery" | "order-policy" | "notifications";
  type Preferences = {
    storeName: string; description: string; address: string; email: string; phone: string;
    adminName: string; adminEmail: string;
    cash: boolean; qris: boolean; bankTransfer: boolean; bankName: string; bankAccountName: string; bankAccountNumber: string;
    operatingDays: string; openTime: string; closeTime: string; pickupMessage: string;
    orderAlerts: boolean; lowStockAlerts: boolean; promoAlerts: boolean;
    deliveryEnabled: boolean; deliveryOrigin: string; deliveryBaseFee: string; deliveryBaseKm: string; deliveryPerKmFee: string; deliveryMaxKm: string;
    maxActiveOrders: string; autoCancelHours: string;
  };
  const defaults: Preferences = {
    storeName: "MettaMart",
    description: "Toko perlengkapan sekolah dan kebutuhan sehari-hari.",
    address: "",
    email: "",
    phone: "",
    adminName: session?.name || "Admin",
    adminEmail: session?.email || "admin@mettamart.id",
    cash: true, qris: true, bankTransfer: true, bankName: "", bankAccountName: "", bankAccountNumber: "",
    operatingDays: "mon,tue,wed,thu,fri", openTime: "", closeTime: "", pickupMessage: "Pengambilan dilakukan di koperasi sekolah setelah pesanan siap." ,
    orderAlerts: true, lowStockAlerts: true, promoAlerts: true,
    deliveryEnabled: true, deliveryOrigin: "", deliveryBaseFee: "10000", deliveryBaseKm: "3", deliveryPerKmFee: "2500", deliveryMaxKm: "15",
    maxActiveOrders: "5", autoCancelHours: "0",
  };
  const [tab, setTab] = useState<SettingsTab>("store");
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const [values, setValues] = useState<Preferences>(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem("mettamart-admin-settings") || "{}") };
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    fetchStorefrontSettings().then((settings) => setValues((current) => ({
      ...current,
      cash: settings.payment_methods.cash,
      qris: settings.payment_methods.qris,
      bankTransfer: settings.payment_methods.bank_transfer,
      bankName: settings.payment_instructions.bank_name,
      bankAccountName: settings.payment_instructions.account_name,
      bankAccountNumber: settings.payment_instructions.account_number,
      operatingDays: settings.operating_hours.days.join(","),
      openTime: settings.operating_hours.open_time,
      closeTime: settings.operating_hours.close_time,
      pickupMessage: settings.pickup_instructions.message,
      storeName: settings.store_profile.name,
      description: settings.store_profile.description,
      address: settings.store_profile.address,
      email: settings.store_profile.email,
      phone: settings.store_profile.phone,
      orderAlerts: settings.notification_preferences.order_alerts,
      lowStockAlerts: settings.notification_preferences.low_stock_alerts,
      promoAlerts: settings.notification_preferences.announcements_enabled,
      maxActiveOrders: String(settings.order_policy.max_active_orders_per_account),
      autoCancelHours: String(settings.order_policy.auto_cancel_unpaid_after_hours),
      ...(settings.delivery_settings ? {
        deliveryEnabled: settings.delivery_settings.enabled,
        deliveryOrigin: settings.delivery_settings.origin_address,
        deliveryBaseFee: String(settings.delivery_settings.base_fee),
        deliveryBaseKm: String(settings.delivery_settings.base_distance_km),
        deliveryPerKmFee: String(settings.delivery_settings.per_km_fee),
        deliveryMaxKm: String(settings.delivery_settings.max_distance_km),
      } : {}),
    }))).catch((reason) => setSettingsLoadError(reason instanceof Error ? reason.message : "Pengaturan server gagal dimuat."));
  }, []);
  const [qrisImage, setQrisImage] = useState("");
  const [qrisError, setQrisError] = useState("");
  useEffect(() => {
    fetchStorefrontSettings().then((settings) => setQrisImage(settings.payment_instructions?.qris_image ?? "")).catch(() => undefined);
  }, []);
  // Perkecil gambar QRIS di browser (maks. 900px) agar ringan dan tetap tajam, lalu simpan ke server saat "Simpan".
  const handleQrisUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setQrisError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setQrisError("Pilih gambar QRIS berformat PNG, JPG, atau WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setQrisError("Ukuran gambar maksimal 5 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 900 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) { setQrisError("Gambar tidak dapat diproses."); return; }
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let output = canvas.toDataURL("image/png");
      if (output.length > 900_000) output = canvas.toDataURL("image/jpeg", 0.85);
      if (output.length > 900_000) { setQrisError("Gambar terlalu besar. Gunakan gambar QRIS yang lebih kecil."); return; }
      setQrisImage(output);
      setSaved(false);
    };
    image.onerror = () => { URL.revokeObjectURL(url); setQrisError("File gambar tidak dapat dibaca."); };
    image.src = url;
  };
  const [saved, setSaved] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [logo, setLogo] = useState(() => localStorage.getItem("mettamart-store-logo") || "/assets/mettamart-logo.png");
  const [logoMessage, setLogoMessage] = useState("");
  const [logoError, setLogoError] = useState("");
  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoError("");
    setLogoMessage("");
    if (!file.type.startsWith("image/")) {
      setLogoError("Pilih file gambar (PNG, JPG, atau WebP).");
      event.target.value = "";
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setLogoError("Ukuran logo maksimal 1,5 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setLogoError("File logo tidak dapat dibaca.");
        return;
      }
      try {
        localStorage.setItem("mettamart-store-logo", reader.result);
        setLogo(reader.result);
        window.dispatchEvent(new Event("mettamart-logo-updated"));
        setLogoMessage("Logo berhasil diperbarui di browser ini.");
      } catch {
        setLogoError("Logo gagal disimpan. Coba gambar yang ukurannya lebih kecil.");
      }
    };
    reader.onerror = () => setLogoError("File logo tidak dapat dibaca.");
    reader.readAsDataURL(file);
  };
  const resetLogo = () => {
    localStorage.removeItem("mettamart-store-logo");
    setLogo("/assets/mettamart-logo.png");
    window.dispatchEvent(new Event("mettamart-logo-updated"));
    setLogoMessage("Logo bawaan MettaMart dipulihkan.");
    setLogoError("");
  };
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaveError("");
    if (tab === "account") {
      try {
        await updateProfile({ name: values.adminName, email: values.adminEmail });
      } catch (reason) {
        setSaved(false);
        setProfileSaveError(reason instanceof Error ? reason.message : "Profil gagal diperbarui.");
        return;
      }
    }
    try {
      if (tab === "store") {
        await updateStorefrontSettings({ store_profile: { name: values.storeName, description: values.description, address: values.address, email: values.email, phone: values.phone } });
      } else if (tab === "notifications") {
        await updateStorefrontSettings({ notification_preferences: { order_alerts: values.orderAlerts, low_stock_alerts: values.lowStockAlerts, announcements_enabled: values.promoAlerts } });
      } else if (tab === "payment") {
        await updateStorefrontSettings({
          payment_methods: { cash: values.cash, qris: values.qris, bank_transfer: values.bankTransfer },
          payment_instructions: { bank_name: values.bankName, account_name: values.bankAccountName, account_number: values.bankAccountNumber, qris_image: qrisImage },
        });
      } else if (tab === "delivery") {
        const base_fee = Number(values.deliveryBaseFee), per_km_fee = Number(values.deliveryPerKmFee);
        const base_distance_km = Number(values.deliveryBaseKm), max_distance_km = Number(values.deliveryMaxKm);
        if (![base_fee, per_km_fee].every((value) => Number.isInteger(value) && value >= 0) || ![base_distance_km, max_distance_km].every((value) => Number.isFinite(value) && value > 0)) {
          throw new Error("Tarif harus bilangan bulat Rp0 atau lebih, dan jarak harus lebih dari 0 km.");
        }
        await updateStorefrontSettings({ delivery_settings: { enabled: values.deliveryEnabled, origin_address: values.deliveryOrigin.trim(), base_fee, base_distance_km, per_km_fee, max_distance_km } });
      } else if (tab === "order-policy") {
        const max_active_orders_per_account = Number(values.maxActiveOrders);
        const auto_cancel_unpaid_after_hours = Number(values.autoCancelHours);
        if (![max_active_orders_per_account, auto_cancel_unpaid_after_hours].every(Number.isSafeInteger)
          || max_active_orders_per_account < 0 || max_active_orders_per_account > 100
          || auto_cancel_unpaid_after_hours < 0 || auto_cancel_unpaid_after_hours > 8760) {
          throw new Error("Batas pesanan harus 0–100 dan waktu pembatalan otomatis harus 0–8760 jam.");
        }
        await updateStorefrontSettings({
          order_policy: { max_active_orders_per_account, auto_cancel_unpaid_after_hours },
        });
      } else if (tab === "pickup") {
        const days = values.operatingDays.split(",").map((day) => day.trim()).filter(Boolean);
        await updateStorefrontSettings({
          operating_hours: { days, open_time: values.openTime, close_time: values.closeTime },
          pickup_instructions: { message: values.pickupMessage },
        });
      }
      localStorage.setItem("mettamart-admin-settings", JSON.stringify(values));
      setSaved(true);
    } catch (reason) {
      setSaved(false);
      setProfileSaveError(reason instanceof Error ? reason.message : "Pengaturan gagal disimpan ke server.");
    }
  };
  const tabs: { id: SettingsTab; label: string; icon: IconName }[] = [
    { id: "store", label: "Informasi Toko", icon: "home" },
    { id: "account", label: "Akun Admin", icon: "users" },
    { id: "payment", label: "Metode Pembayaran", icon: "bag" },
    { id: "pickup", label: "Jam Operasional & Pengambilan", icon: "clock" },
    { id: "delivery", label: "Pengiriman GoSend", icon: "box" },
    { id: "order-policy", label: "Kebijakan Pesanan", icon: "clock" },
    { id: "notifications", label: "Notifikasi Sistem", icon: "bell" },
  ];
  const field = (label: string, key: keyof Preferences, type: "text" | "email" | "tel" | "time" | "number" = "text") => (
    <label key={key}>
      {label}
      <input type={type} value={String(values[key])} onChange={(event) => update(key, event.target.value as Preferences[typeof key])} />
    </label>
  );
  const toggle = (label: string, key: keyof Preferences, description: string) => (
    <label className="settings-toggle" key={key}>
      <span><b>{label}</b><small>{description}</small></span>
      <input type="checkbox" checked={Boolean(values[key])} onChange={(event) => update(key, event.target.checked as Preferences[typeof key])} />
    </label>
  );
  return (
    <>
      <Header title="Pengaturan" subtitle="Kelola konfigurasi operasional MettaMart." />
      <div className="settings-layout panel">
        <aside>
          {tabs.map((item) => (
            <button type="button" className={tab === item.id ? "active" : ""} key={item.id} onClick={() => { setTab(item.id); setSaved(false); }}>
              <Icon name={item.icon} />{item.label}
            </button>
          ))}
        </aside>
        <form onSubmit={submit}>
          {tab === "store" && <>
            <h2>Informasi Toko</h2>
            {field("Nama Toko", "storeName")}
            <label>Deskripsi<textarea value={values.description} onChange={(event) => update("description", event.target.value)} /></label>
            {field("Alamat", "address")}
            {field("Email", "email", "email")}
            {field("No. Telepon", "phone", "tel")}
          </>}
          {tab === "account" && <>
            <h2>Akun Admin</h2>
            <p>Ubah informasi profil admin dan kelola password akun sendiri.</p>
            {field("Nama Admin", "adminName")}
            {field("Email Admin", "adminEmail", "email")}
            <h3>Keamanan akun</h3>
            <ChangePasswordForm />
          </>}
          {tab === "payment" && <>
            <h2>Metode Pembayaran</h2>
            <p>Aktifkan metode pembayaran yang dapat dipilih pelanggan.</p>
            {toggle("Tunai di kasir", "cash", "Pembayaran langsung saat mengambil pesanan.")}
            {toggle("QRIS", "qris", "Pembayaran menggunakan QRIS.")}
            {toggle("Transfer bank", "bankTransfer", "Transfer manual yang perlu diverifikasi admin.")}
            {field("Nama Bank", "bankName")}
            {field("Nama Pemilik Rekening", "bankAccountName")}
            {field("Nomor Rekening", "bankAccountNumber")}
            <div className="qris-upload">
              <span className="qris-upload__title">Gambar QRIS</span>
              <p>Unggah gambar QRIS resmi koperasi. Gambar ini hanya ditampilkan di halaman detail pesanan siswa/orang tua setelah pesanan dikonfirmasi dan sebelum lunas.</p>
              <div className="qris-upload__body">
                <div className="qris-upload__preview">{qrisImage ? <img src={qrisImage} alt="Pratinjau QRIS" /> : <span>Belum ada gambar QRIS</span>}</div>
                <div className="qris-upload__actions">
                  <label className="logo-upload__choose">{qrisImage ? "Ganti gambar QRIS" : "Pilih gambar QRIS"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleQrisUpload} /></label>
                  {qrisImage && <button type="button" className="logo-upload__reset" onClick={() => { setQrisImage(""); setSaved(false); }}>Hapus gambar</button>}
                  <small>PNG, JPG, atau WebP. Klik “Simpan” agar perubahan berlaku.</small>
                  {qrisError && <small className="logo-upload__error" role="alert">{qrisError}</small>}
                </div>
              </div>
            </div>
          </>}
          {tab === "pickup" && <>
            <h2>Jam Operasional & Pengambilan</h2>
            <p>Pemesanan ambil di koperasi dapat dilakukan kapan saja. Jam ini mengatur kapan pesanan boleh diambil/diantar, dan pesanan GoSend hanya dapat dibuat pada jam ini.</p>
            <div className="settings-day-picker">
              <span>Hari Operasional</span>
              {[
                ["mon", "Senin"], ["tue", "Selasa"], ["wed", "Rabu"], ["thu", "Kamis"],
                ["fri", "Jumat"], ["sat", "Sabtu"], ["sun", "Minggu"],
              ].map(([day, label]) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={values.operatingDays.split(",").includes(day)}
                    onChange={(event) => {
                      const current = values.operatingDays.split(",").filter(Boolean);
                      const next = event.target.checked ? [...current, day] : current.filter((item) => item !== day);
                      update("operatingDays", next.join(","));
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="form-row">{field("Jam buka", "openTime", "time")}{field("Jam tutup", "closeTime", "time")}</div>
            <label>Instruksi pengambilan<textarea value={values.pickupMessage} onChange={(event) => update("pickupMessage", event.target.value)} /></label>
          </>}
          {tab === "delivery" && <>
            <h2>Pengiriman GoSend</h2>
            <p>Siswa dan orang tua dapat memilih GoSend saat koperasi buka. Ongkir dihitung otomatis: tarif dasar sampai jarak tertentu, lalu tambahan per km. Nilainya estimasi, bukan harga resmi GoSend.</p>
            {toggle("Aktifkan GoSend", "deliveryEnabled", "Jika dimatikan, pelanggan hanya dapat memilih ambil di koperasi.")}
            <label>Alamat asal pengiriman<textarea value={values.deliveryOrigin} onChange={(event) => update("deliveryOrigin", event.target.value)} placeholder={values.address || "Kosongkan untuk memakai alamat di Informasi Toko"} /></label>
            <div className="form-row">
              {field("Tarif dasar (Rp)", "deliveryBaseFee", "number")}
              {field("Jarak tarif dasar (km)", "deliveryBaseKm", "number")}
            </div>
            <div className="form-row">
              {field("Tambahan per km (Rp)", "deliveryPerKmFee", "number")}
              {field("Jangkauan maksimal (km)", "deliveryMaxKm", "number")}
            </div>
            <p className="settings-help">Jarak dihitung dari garis lurus alamat koperasi ke alamat tujuan dikali 1,3 (faktor rute jalan). Pastikan alamat koperasi lengkap sampai kota agar dapat ditemukan di peta. Admin tetap memesan kurir GoSend secara manual dari aplikasi GoSend/Gojek.</p>
          </>}
          {tab === "order-policy" && <>
            <h2>Kebijakan Pesanan</h2>
            <p>Atur jumlah pesanan aktif dan kapan pesanan yang belum dibayar akan dibatalkan otomatis. Waktu dihitung sejak pesanan dibuat. Nilai 0 berarti tanpa batas atau nonaktif.</p>
            {field("Maksimal pesanan aktif per akun (0 = tanpa batas)", "maxActiveOrders", "number")}
            {field("Pembatalan otomatis setelah (jam, 0 = nonaktif)", "autoCancelHours", "number")}
            <p className="settings-help">Batas keamanan tambahan tetap berlaku: maksimal 20 pesanan baru per akun dalam satu jam. Pesanan yang sudah lunas atau sedang menunggu verifikasi pembayaran tidak pernah dibatalkan otomatis. Jika dibatalkan, stok dikembalikan dan pelanggan menerima notifikasi.</p>
          </>}
          {tab === "notifications" && <>
            <h2>Notifikasi Sistem</h2>
            {toggle("Pesanan baru", "orderAlerts", "Beri tahu admin saat ada pesanan masuk.")}
            {toggle("Stok menipis", "lowStockAlerts", "Peringatan saat stok produk rendah.")}
            {toggle("Promo dan pengumuman", "promoAlerts", "Izinkan pengumuman promo ke pelanggan.")}
          </>}
          {settingsLoadError && <p className="auth-error" role="alert">{settingsLoadError}</p>}
          <div className="settings-form-footer">
            <button type="submit" className="primary">Simpan Pengaturan</button>
            {profileSaveError && <span className="logo-upload__error" role="alert">{profileSaveError}</span>}
            {saved && <span role="status">{tab === "store" || tab === "payment" || tab === "pickup" || tab === "delivery" || tab === "order-policy" || tab === "notifications" ? "Pengaturan tersimpan di server." : "Pengaturan tersimpan di browser ini."}</span>}
          </div>
        </form>
        <div className="logo-upload">
          <span className="logo-upload__title">Logo Toko</span>
          <div className="logo-upload__preview">
            <img src={logo} alt="Pratinjau logo toko" />
          </div>
          <label className="logo-upload__choose">
            Pilih gambar logo
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleLogoUpload} />
          </label>
          <button type="button" className="logo-upload__reset" onClick={resetLogo}>Pulihkan logo bawaan</button>
          <small>Format PNG, JPG, WebP atau GIF. Maksimal 1,5 MB. Tersimpan di browser ini.</small>
          {logoMessage && <small className="logo-upload__success" role="status">{logoMessage}</small>}
          {logoError && <small className="logo-upload__error" role="alert">{logoError}</small>}
        </div>
      </div>
    </>
  );
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel__title">
          <h2>{title}</h2>
          <button onClick={close}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MobileApp({ view, setView }: { view: View; setView: (v: View) => void }) {
  const products = useProducts();
  const [query, setQuery] = useState("");
  const [mobileCategory, setMobileCategory] = useState<CategoryId | typeof ALL_CATEGORIES>(
    ALL_CATEGORIES,
  );
  const [cart, setCart] = useState<number[]>([]);
  const [mobileNotice, setMobileNotice] = useState<(typeof notifications)[number] | null>(null);
  const mobileView =
    view === "dashboard"
      ? "dashboard"
      : view === "stock"
        ? "stock"
        : view === "notifications"
          ? "notifications"
          : "orders";
  const visible = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) &&
          (mobileCategory === ALL_CATEGORIES || p.category === mobileCategory),
      ),
    [products, query, mobileCategory],
  );
  return (
    <div className="mobile-app">
      <div className="mobile-head">
        <Brand compact />
        <button onClick={() => setView("notifications")}>
          <Icon name="bell" />
          <em>{notifications.length}</em>
        </button>
      </div>
      {mobileView === "dashboard" && (
        <main className="mobile-home">
          <h1>Halo, Andi Pratama!</h1>
          <p>Semangat belajar hari ini!</p>
          <button className="profile-card">
            <span className="avatar">AP</span>
            <div>
              <b>Andi Pratama</b>
              <small>Kelas 8A</small>
            </div>
            <Icon name="chevron" />
          </button>
          <label className="search">
            <Icon name="search" />
            <input
              placeholder="Cari barang, buku, atau kebutuhan sekolah..."
              onFocus={() => setView("stock")}
            />
          </label>
          <div className="mobile-title">
            <h2>Kategori</h2>
            <button onClick={() => setView("stock")}>Lihat Semua ›</button>
          </div>
          <div className="category-grid">
            {categories.map((item) => (
              <button
                onClick={() => {
                  setMobileCategory(item.id);
                  setView("stock");
                }}
                key={item.id}
              >
                <span>
                  <Icon name={item.icon === "shirt" ? "shirt" : "box"} />
                </span>
                {item.label}
              </button>
            ))}
          </div>
          <div className="mobile-title">
            <h2>Stok Tersedia</h2>
            <button onClick={() => setView("stock")}>Lihat Semua ›</button>
          </div>
          <div className="product-strip">
            {products.slice(0, 3).map((p) => (
              <article key={p.id}>
                <ProductArt type={p.art} />
                <b>{p.name}</b>
                <span>{money(p.price)}</span>
                <Status>Tersedia</Status>
                <button onClick={() => setCart([...cart, p.id])}>Pesan</button>
              </article>
            ))}
          </div>
          <div className="promo">
            <span className="mini-icon">
              <Icon name="bag" />
            </span>
            <div>
              <b>Pesan sekarang dan dapatkan</b>
              <br />
              harga terbaik!
            </div>
          </div>
        </main>
      )}
      {mobileView === "stock" && (
        <main>
          <div className="mobile-page-title">
            <button onClick={() => setView("dashboard")}>‹</button>
            <h1>Stok Barang</h1>
          </div>
          <label className="search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk..."
            />
          </label>
          <div className="tabs mobile-tabs">
            {[{ id: ALL_CATEGORIES, label: "Semua" }, ...categories].map((item) => (
              <button
                key={item.id}
                className={mobileCategory === item.id ? "active" : ""}
                onClick={() => setMobileCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mobile-products">
            {visible.map((p) => (
              <article key={p.id}>
                <ProductArt type={p.art} />
                <div>
                  <b>{p.name}</b>
                  <span>{money(p.price)}</span>
                  <small>Stok: {p.stock}</small>
                </div>
                <Status>{p.stock ? "Tersedia" : "Habis"}</Status>
                <button disabled={!p.stock} onClick={() => setCart([...cart, p.id])}>
                  {cart.includes(p.id) ? "Ditambah" : "Pesan"}
                </button>
              </article>
            ))}
          </div>
        </main>
      )}
      {mobileView === "orders" && (
        <main>
          <div className="mobile-page-title">
            <button onClick={() => setView("dashboard")}>‹</button>
            <h1>Pesanan Saya</h1>
          </div>
          <div className="tabs mobile-tabs">
            <button className="active">Semua</button>
            <button>Diproses</button>
            <button>Siap Diambil</button>
            <button>Selesai</button>
          </div>
          <div className="mobile-orders">
            {orders.slice(0, 3).map((o) => (
              <article key={o.code}>
                <div>
                  <b>#{o.code}</b>
                  <Status>{o.status}</Status>
                </div>
                <small>{o.date}</small>
                <p>
                  <ProductArt type={o.code === "MTM-0127" ? "bottle" : "book"} />{" "}
                  {o.code === "MTM-0127" ? "Minuman Botol × 2" : "Buku Tulis & Pensil 2B"}
                </p>
                <footer>
                  <span>Total</span>
                  <b>{money(o.total)}</b>
                </footer>
              </article>
            ))}
          </div>
        </main>
      )}
      {mobileView === "notifications" && (
        <main>
          <div className="mobile-page-title">
            <button onClick={() => setView("dashboard")}>‹</button>
            <h1>Notifikasi</h1>
          </div>
          <div className="mobile-notifications">
            {notifications.map((n, i) => (
              <button type="button" key={n.title} onClick={() => setMobileNotice(n)}>
                <span className="mini-icon">
                  <Icon name={i % 2 ? "box" : "bell"} />
                </span>
                <span>
                  <b>{n.title}</b>
                  <small>{n.text}</small>
                  <time>{n.time}</time>
                </span>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </main>
      )}
      {mobileNotice && (
        <Modal title="Detail Notifikasi" close={() => setMobileNotice(null)}>
          <div className="notification-detail">
            <h3>{mobileNotice.title}</h3>
            <p>{mobileNotice.text}</p>
            <time>{mobileNotice.time}</time>
            <button className="primary wide" onClick={() => setMobileNotice(null)}>Tutup</button>
          </div>
        </Modal>
      )}
      <nav className="bottom-nav">
        <button
          className={mobileView === "dashboard" ? "active" : ""}
          onClick={() => setView("dashboard")}
        >
          <Icon name="home" />
          Beranda
        </button>
        <button className={mobileView === "stock" ? "active" : ""} onClick={() => setView("stock")}>
          <Icon name="box" />
          Stok
        </button>
        <button
          className={mobileView === "orders" ? "active" : ""}
          onClick={() => setView("orders")}
        >
          <Icon name="bag" />
          Pesanan
        </button>
        <button
          className={mobileView === "notifications" ? "active" : ""}
          onClick={() => setView("notifications")}
        >
          <Icon name="bell" />
          Notifikasi
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const pages: Record<View, ReactNode> = {
    dashboard: <Dashboard />,
    stock: <Stock />,
    orders: <Orders />,
    notifications: <Notifications />,
    reports: <Reports />,
    settings: <Settings />,
  };
  return (
    <>
      <div className="desktop-app">
        <Sidebar view={view} setView={setView} />
        <main className="workspace">{pages[view]}</main>
      </div>
      <MobileApp view={view} setView={setView} />
    </>
  );
}

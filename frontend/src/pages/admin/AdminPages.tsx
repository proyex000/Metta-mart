import { FormEvent, ReactNode, useMemo, useState } from "react";

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
  | "chevron";

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
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <svg className="brand__mark" viewBox="0 0 64 62" aria-hidden="true">
        <path
          d="M14 25h39l-5 22H23z"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <path
          d="M19 48h28M23 53h1M43 53h1"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="m20 24-4-15 7-2 4 17M29 24 28 4h8l1 20M39 24l7-17 7 3-7 16"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      <div>
        <strong>
          Metta<span>Mart</span>
        </strong>
        <small>Sekolah Metta Maitreya</small>
      </div>
    </div>
  );
}

const products = [
  { id: 1, name: "Buku Tulis", category: "ATK", price: 5000, stock: 120, art: "book" },
  { id: 2, name: "Pensil 2B", category: "ATK", price: 3000, stock: 50, art: "pencil" },
  { id: 3, name: "Penghapus", category: "ATK", price: 2000, stock: 8, art: "eraser" },
  { id: 4, name: "Rautan", category: "ATK", price: 4000, stock: 0, art: "sharpener" },
  { id: 5, name: "Minuman Botol", category: "Minuman", price: 8000, stock: 35, art: "bottle" },
];

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
    status: "Dikirim",
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

function ProductArt({ type }: { type: string }) {
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
      : label.includes("Dikirim")
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
        <span>
          <Icon name="calendar" size={15} /> 12 Oktober 2025
        </span>
        <span>
          <Icon name="clock" size={15} /> 10:24
        </span>
        <span className="avatar">A</span>
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
  const stats = [
    { icon: "box" as IconName, label: "Total Produk", value: "85", note: "3 dari minggu lalu" },
    { icon: "bag" as IconName, label: "Pesanan Masuk", value: "27", note: "12% dari kemarin" },
    { icon: "truck" as IconName, label: "Sedang Dikirim", value: "12", note: "5% dari kemarin" },
    {
      icon: "users" as IconName,
      label: "Pelanggan Aktif",
      value: "143",
      note: "8% dari minggu lalu",
    },
  ];
  return (
    <>
      <Header title="Halo, Admin!" subtitle="Selamat datang di dashboard MettaMart." />
      <section className="stat-grid">
        {stats.map((s) => (
          <article className="stat-card" key={s.label}>
            <span>
              <Icon name={s.icon} />
            </span>
            <div>
              <small>{s.label}</small>
              <strong>{s.value}</strong>
              <em>↑ {s.note}</em>
            </div>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel__title">
            <h2>Penjualan 7 Hari Terakhir</h2>
            <select>
              <option>Jumlah Pesanan</option>
            </select>
          </div>
          <div className="line-chart">
            <div className="chart-labels">
              <span>40</span>
              <span>30</span>
              <span>20</span>
              <span>10</span>
              <span>0</span>
            </div>
            <svg viewBox="0 0 600 210" preserveAspectRatio="none">
              <defs>
                <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ff3b30" stopOpacity=".25" />
                  <stop offset="1" stopColor="#ff3b30" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                className="area"
                d="M0 154 C45 152 70 188 120 169 S185 125 225 128 S300 49 352 62 S426 118 480 83 S550 57 600 17 V210H0Z"
              />
              <path
                className="line"
                d="M0 154 C45 152 70 188 120 169 S185 125 225 128 S300 49 352 62 S426 118 480 83 S550 57 600 17"
              />
            </svg>
            <div className="chart-days">
              <span>6 Okt</span>
              <span>7 Okt</span>
              <span>8 Okt</span>
              <span>9 Okt</span>
              <span>10 Okt</span>
              <span>11 Okt</span>
              <span>12 Okt</span>
            </div>
          </div>
        </article>
        <article className="panel latest">
          <div className="panel__title">
            <h2>Pesanan Terbaru</h2>
            <button onClick={() => window.location.assign("/admin/orders")}>Lihat Semua ›</button>
          </div>
          {orders.map((o) => (
            <div className="latest__row" key={o.code}>
              <span className="mini-icon">
                <Icon name="bag" size={16} />
              </span>
              <div>
                <b>#{o.code}</b>
                <small>{o.date}</small>
              </div>
              <Status>{o.status}</Status>
              <span>{money(o.total)}</span>
            </div>
          ))}
        </article>
      </section>
    </>
  );
}

export function Stock() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua Kategori");
  const [items, setItems] = useState(products);
  const [showAdd, setShowAdd] = useState(false);
  const filtered = items.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (category === "Semua Kategori" || p.category === category),
  );
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
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option>Semua Kategori</option>
            <option>ATK</option>
            <option>Minuman</option>
          </select>
          <select>
            <option>Semua Stok</option>
            <option>Tersedia</option>
            <option>Hampir Habis</option>
          </select>
          <button className="primary" onClick={() => setShowAdd(true)}>
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
                    <ProductArt type={p.art} />
                  </td>
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>{p.category}</td>
                  <td>{money(p.price)}</td>
                  <td className={p.stock < 10 ? "danger" : ""}>{p.stock}</td>
                  <td>
                    <Status>
                      {p.stock === 0 ? "Habis" : p.stock < 10 ? "Hampir Habis" : "Tersedia"}
                    </Status>
                  </td>
                  <td>
                    <button className="icon-button" onClick={() => setShowAdd(true)}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => setItems(items.filter((x) => x.id !== p.id))}
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
      {showAdd && (
        <Modal title="Tambah Produk" close={() => setShowAdd(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setItems([
                ...items,
                {
                  id: Date.now(),
                  name: "Produk Baru",
                  category: "ATK",
                  price: 5000,
                  stock: 20,
                  art: "book",
                },
              ]);
              setShowAdd(false);
            }}
          >
            <label>
              Nama Produk
              <input defaultValue="Produk Baru" />
            </label>
            <div className="form-row">
              <label>
                Kategori
                <select>
                  <option>ATK</option>
                  <option>Minuman</option>
                </select>
              </label>
              <label>
                Stok
                <input type="number" defaultValue="20" />
              </label>
            </div>
            <button className="primary wide">Simpan Produk</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Orders() {
  const [tab, setTab] = useState("Semua");
  const [selected, setSelected] = useState<(typeof orders)[number] | null>(null);
  const tabs = ["Semua", "Menunggu Konfirmasi", "Diproses", "Dikirim", "Selesai"];
  const shown = tab === "Semua" ? orders : orders.filter((o) => o.status === tab);
  return (
    <>
      <Header title="Pesanan" subtitle="Kelola pesanan pelanggan dan atur status pengiriman." />
      <div className="panel table-panel">
        <div className="tabs">
          {tabs.map((t) => (
            <button className={tab === t ? "active" : ""} onClick={() => setTab(t)} key={t}>
              {t}
              {t === "Semua" && " (27)"}
            </button>
          ))}
        </div>
        <label className="search order-search">
          <Icon name="search" size={16} />
          <input placeholder="Cari nomor pesanan / nama pelanggan..." />
        </label>
        <div className="desktop-table">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Kode Pesanan</th>
                <th>Tanggal</th>
                <th>Pelanggan</th>
                <th>Total</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o, i) => (
                <tr key={o.code}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{o.code}</b>
                  </td>
                  <td>{o.date}</td>
                  <td>{o.customer}</td>
                  <td>
                    <b>{money(o.total)}</b>
                  </td>
                  <td>
                    <Status>{o.status}</Status>
                  </td>
                  <td>
                    <button className="primary small" onClick={() => setSelected(o)}>
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="table-foot">Total {shown.length} pesanan</p>
      </div>
      {selected && (
        <Modal title={`Detail ${selected.code}`} close={() => setSelected(null)}>
          <div className="admin-order-detail">
            <p>
              <span>Pelanggan</span>
              <b>{selected.customer}</b>
            </p>
            <p>
              <span>Tanggal</span>
              <b>{selected.date}</b>
            </p>
            <p>
              <span>Total</span>
              <b>{money(selected.total)}</b>
            </p>
            <p>
              <span>Status</span>
              <Status>{selected.status}</Status>
            </p>
            <button className="primary wide" onClick={() => setSelected(null)}>
              Tutup Detail
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Notifications() {
  const [items, setItems] = useState(notifications);
  const [filter, setFilter] = useState(0);
  return (
    <>
      <Header title="Notifikasi" subtitle="Kirim pesan dan informasi kepada pelanggan." />
      <div className="notification-layout">
        <aside className="panel notification-nav">
          <button
            className="primary wide"
            onClick={() =>
              setItems([
                {
                  title: "Informasi baru",
                  text: "Pesan baru untuk seluruh pelanggan.",
                  time: "Baru saja",
                  type: "Info",
                },
                ...items,
              ])
            }
          >
            <Icon name="plus" size={16} /> Kirim Notifikasi Baru
          </button>
          {[
            "Semua Notifikasi",
            "Pesanan Diterima",
            "Pesanan Dikirim",
            "Promo & Info",
            "Stok Produk",
          ].map((t, i) => (
            <button className={i === filter ? "active" : ""} key={t} onClick={() => setFilter(i)}>
              <Icon name={i === 0 ? "bell" : i < 3 ? "box" : "chart"} />
              <span>{t}</span>
              <b>{[24, 8, 7, 5, 4][i]}</b>
            </button>
          ))}
        </aside>
        <section className="panel notification-list">
          <div className="panel__title">
            <h2>Daftar Notifikasi</h2>
            <button
              onClick={() => {
                setFilter(0);
                setItems(notifications);
              }}
            >
              Lihat Semua ›
            </button>
          </div>
          {items.map((n, i) => (
            <article key={`${n.title}-${i}`}>
              <span className="mini-icon">
                <Icon name={i % 2 ? "box" : "bell"} />
              </span>
              <div>
                <b>{n.title}</b>
                <p>{n.text}</p>
              </div>
              <time>{n.time}</time>
              <Status>{n.type}</Status>
              <Icon name="chevron" size={15} />
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

export function Reports() {
  const bars = [45, 32, 64, 48, 59, 78, 46, 76];
  return (
    <>
      <Header title="Laporan" subtitle="Lihat ringkasan data penjualan dan aktivitas toko." />
      <section className="report-summary">
        <article>
          <span className="mini-icon">
            <Icon name="chart" />
          </span>
          <div>
            <small>Total Penjualan</small>
            <strong>Rp 4.820.000</strong>
            <em>↑ 12% dari periode sebelumnya</em>
          </div>
        </article>
        <article>
          <span className="mini-icon">
            <Icon name="bag" />
          </span>
          <div>
            <small>Jumlah Pesanan</small>
            <strong>86</strong>
            <em>↑ 12% dari periode sebelumnya</em>
          </div>
        </article>
        <article>
          <span className="mini-icon">
            <Icon name="bag" />
          </span>
          <div>
            <small>Rata-rata Transaksi</small>
            <strong>Rp 56.047</strong>
            <em>↑ 8% dari periode sebelumnya</em>
          </div>
        </article>
      </section>
      <section className="report-grid">
        <article className="panel">
          <div className="panel__title">
            <h2>Grafik Penjualan</h2>
            <select>
              <option>7 Hari Terakhir</option>
            </select>
          </div>
          <div className="bar-chart">
            {bars.map((h, i) => (
              <div key={i}>
                <i style={{ height: `${h}%` }} />
                <small>{i + 5} Okt</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel__title">
            <h2>Penjualan per Kategori</h2>
          </div>
          <div className="donut-wrap">
            <div className="donut">
              <span>
                Total<b>Rp 4,82jt</b>
              </span>
            </div>
            <ul>
              <li>
                <i /> ATK <b>45%</b>
              </li>
              <li>
                <i /> Minuman <b>25%</b>
              </li>
              <li>
                <i /> Makanan <b>15%</b>
              </li>
              <li>
                <i /> Lainnya <b>15%</b>
              </li>
            </ul>
          </div>
        </article>
      </section>
    </>
  );
}

export function Settings() {
  const [saved, setSaved] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };
  return (
    <>
      <Header title="Pengaturan" subtitle="Kelola informasi akun dan pengaturan sistem." />
      <div className="settings-layout panel">
        <aside>
          {[
            "Informasi Toko",
            "Akun Admin",
            "Metode Pembayaran",
            "Pengiriman",
            "Notifikasi Sistem",
          ].map((x, i) => (
            <button className={i === 0 ? "active" : ""} key={x}>
              <Icon name={i === 0 ? "home" : i === 1 ? "users" : i === 3 ? "truck" : "bell"} />
              {x}
            </button>
          ))}
        </aside>
        <form onSubmit={submit}>
          <h2>Informasi Toko</h2>
          <label>
            Nama Toko
            <input defaultValue="MettaMart" />
          </label>
          <label>
            Deskripsi
            <textarea defaultValue="Toko perlengkapan sekolah dan kebutuhan sehari-hari." />
          </label>
          <label>
            Alamat
            <input defaultValue="Jl. Metta Maitreya No. 123, Jakarta Barat" />
          </label>
          <label>
            Email
            <input defaultValue="mettamart@sekolahmetta.id" />
          </label>
          <label>
            No. Telepon
            <input defaultValue="0812 3456 7890" />
          </label>
          <button className="primary">{saved ? "Perubahan Tersimpan" : "Simpan Perubahan"}</button>
        </form>
        <div className="logo-upload">
          <span>Logo Toko</span>
          <Brand compact />
          <button>
            <Icon name="edit" size={14} /> Ubah Logo
          </button>
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
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<number[]>([]);
  const mobileView =
    view === "dashboard"
      ? "dashboard"
      : view === "stock"
        ? "stock"
        : view === "notifications"
          ? "notifications"
          : "orders";
  const visible = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [query],
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
            {["Alat Tulis", "Buku", "Minuman", "Lainnya"].map((x, i) => (
              <button onClick={() => setView("stock")} key={x}>
                <span>
                  <Icon name={i === 2 ? "bag" : i === 3 ? "box" : "edit"} />
                </span>
                {x}
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
            <button className="active">Semua</button>
            <button>Alat Tulis</button>
            <button>Buku</button>
            <button>Minuman</button>
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
            <button>Dikirim</button>
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
              <article key={n.title}>
                <span className="mini-icon">
                  <Icon name={i % 2 ? "box" : "bell"} />
                </span>
                <div>
                  <b>{n.title}</b>
                  <p>{n.text}</p>
                  <time>{n.time}</time>
                </div>
                <Icon name="chevron" />
              </article>
            ))}
          </div>
        </main>
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

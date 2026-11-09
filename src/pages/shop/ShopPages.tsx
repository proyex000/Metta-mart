import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Icon, PageTitle, ProductArt, Status } from "../../components/ui";
import { money, notices, orders, products } from "../../data/mock";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types";

export function ShopDashboard({ role }: { role: Exclude<Role, "admin"> }) {
  const { session } = useAuth();
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
      <section className="shop-profile">
        <span className="role-avatar">AP</span>
        <div>
          <small>{role === "parent" ? "Anak" : "Siswa"}</small>
          <b>Andi Pratama</b>
          <span>Kelas 8A</span>
        </div>
        <span>›</span>
      </section>
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
          onFocus={() => {
            location.href = `${base}/stock`;
          }}
        />
      </label>
      <div className="section-heading">
        <h2>{role === "parent" ? "Kebutuhan Anak" : "Kategori"}</h2>
        <Link to={`${base}/stock`}>Lihat Semua ›</Link>
      </div>
      <section className="category-grid">
        {["Alat Tulis", "Buku", "Minuman", "Lainnya"].map((item, index) => (
          <Link to={`${base}/stock`} key={item}>
            <span>
              <Icon name={index === 1 ? "bag" : "box"} />
            </span>
            {item}
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const list = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) &&
          (category === "Semua" || p.category === category),
      ),
    [query, category],
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
        {["Semua", "ATK", "Buku", "Minuman"].map((item) => (
          <button
            key={item}
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {item}
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
              <small>Stok: {product.stock}</small>
            </div>
            <Status>
              {product.stock === 0 ? "Habis" : product.stock < 10 ? "Hampir Habis" : "Tersedia"}
            </Status>
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
  const [counts, setCounts] = useState<Record<number, number>>({ 1: 1 });
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const selected = products.filter((product) => counts[product.id]);
  const total = selected.reduce((sum, product) => sum + product.price * counts[product.id], 0);
  const change = (id: number, amount: number) =>
    setCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] || 0) + amount) }));
  const submit = () => {
    if (!total) return;
    setSent(true);
    setTimeout(() => navigate(`/${role}/orders`), 900);
  };
  return (
    <>
      <PageTitle title="Pesan Barang" subtitle="Pilih jumlah barang yang ingin dipesan." />
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
              <span>{money(product.price)}</span>
            </div>
            <div className="quantity">
              <button onClick={() => change(product.id, -1)}>−</button>
              <b>{counts[product.id] || 0}</b>
              <button onClick={() => change(product.id, 1)}>+</button>
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
      <button className="primary wide order-submit" disabled={!total || sent} onClick={submit}>
        {sent ? "Pesanan berhasil dikirim" : "Kirim Pesanan"}
      </button>
    </>
  );
}

export function ShopOrders({ role }: { role: Exclude<Role, "admin"> }) {
  const [tab, setTab] = useState("Semua");
  const shown = tab === "Semua" ? orders : orders.filter((order) => order.status === tab);
  return (
    <>
      <PageTitle
        title={role === "student" ? "Pesanan Saya" : "Pesanan"}
        subtitle="Pantau status pesanan dengan mudah."
      />
      <div className="tabs shop-tabs">
        {["Semua", "Diproses", "Dikirim", "Selesai"].map((item) => (
          <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>
            {item}
          </button>
        ))}
      </div>
      <section className="shop-orders">
        {shown.map((order) => (
          <article key={order.code}>
            <div>
              <b>#{order.code}</b>
              <Status>{order.status}</Status>
            </div>
            <small>{order.date}</small>
            <p>
              <ProductArt type={order.code === "MTM-0127" ? "bottle" : "book"} /> Buku Tulis &
              Pensil 2B
            </p>
            <footer>
              <span>
                Total <strong>{money(order.total)}</strong>
              </span>
              <Link to={`/${role}/orders/${order.code}`}>Lihat Detail ›</Link>
            </footer>
          </article>
        ))}
      </section>
    </>
  );
}

export function OrderDetail({ role }: { role: Exclude<Role, "admin"> }) {
  const { code } = useParams();
  const navigate = useNavigate();
  const order = orders.find((item) => item.code === code) || orders[0];
  return (
    <>
      <button className="back-button" onClick={() => navigate(-1)}>
        <Icon name="back" /> Kembali
      </button>
      <PageTitle title="Detail Pesanan" subtitle={`#${order.code} · ${order.date}`} />
      <section className="detail-card">
        <div className="detail-head">
          <span className="mini-icon">
            <Icon name="box" />
          </span>
          <div>
            <b>#{order.code}</b>
            <small>{order.date}</small>
          </div>
          <Status>{order.status}</Status>
        </div>
        <h2>Item Pesanan</h2>
        {products.slice(0, 2).map((product) => (
          <div className="detail-product" key={product.id}>
            <ProductArt type={product.art} />
            <div>
              <b>{product.name}</b>
              <span>{money(product.price)}</span>
            </div>
            <span>1×</span>
          </div>
        ))}
        <div className="detail-total">
          <span>Total Belanja</span>
          <strong>{money(order.total)}</strong>
        </div>
        <h2>Informasi Pengiriman</h2>
        <dl>
          <dt>Pengirim</dt>
          <dd>Admin MettaMart</dd>
          <dt>Status</dt>
          <dd>
            <Status>{order.status}</Status>
          </dd>
        </dl>
        <div className="timeline">
          <b>Pesanan Diterima</b>
          <span>Sedang Diproses</span>
          <span>Dikirim</span>
          <span>Selesai</span>
        </div>
        <button
          className="primary wide"
          onClick={() => alert("Pesan bantuan telah dikirim ke admin.")}
        >
          Hubungi Admin
        </button>
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

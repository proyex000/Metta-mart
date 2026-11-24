import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { fetchOrder, type CommerceOrder } from "../../services/commerce";

type PaperWidth = "58" | "80";

const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function orderStatus(order: CommerceOrder) {
  if (order.status === "cancelled") return "DIBATALKAN";
  return ({
    pending: "Menunggu konfirmasi",
    accepted: "Diproses",
    ready_for_pickup: order.delivery_method === "gosend" ? "Siap diantar" : "Siap diambil",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  })[order.status];
}

function paymentStatus(order: CommerceOrder) {
  return ({
    unpaid: "Belum dibayar",
    pending_verification: "Menunggu verifikasi",
    paid: "Lunas",
    failed: "Ditolak / perlu konfirmasi ulang",
    refunded: "Dikembalikan",
  })[order.payment_status];
}

function paymentMethod(order: CommerceOrder) {
  return ({ cash: "Tunai", bank_transfer: "Transfer bank", qris: "QRIS" })[order.payment_method];
}

export function ReceiptPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>("58");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchOrder(code)
      .then((data) => { if (active) setOrder(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Struk gagal dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [code]);

  if (loading) return <main className="receipt-loading">Memuat struk transaksi...</main>;
  if (error || !order) return (
    <main className="receipt-loading">
      <h1>Struk tidak dapat dibuka</h1>
      <p>{error || "Transaksi tidak ditemukan atau Anda tidak memiliki akses."}</p>
      <button className="secondary" onClick={() => navigate(-1)}>Kembali</button>
    </main>
  );

  const isCancelled = order.status === "cancelled";
  const isGosend = order.delivery_method === "gosend";
  const cash = order.cash_received;
  const pageWidth = paperWidth === "58" ? "58mm" : "80mm";

  return (
    <main className="receipt-screen">
      <style>{`@page { size: ${pageWidth} auto; margin: 3mm; }`}</style>
      <div className="receipt-toolbar no-print">
        <button className="secondary" onClick={() => navigate(-1)}>Kembali</button>
        <label>
          Ukuran kertas
          <select value={paperWidth} onChange={(event) => setPaperWidth(event.target.value as PaperWidth)}>
            <option value="58">Thermal 58 mm</option>
            <option value="80">Thermal 80 mm</option>
          </select>
        </label>
        <button className="primary" onClick={() => window.print()}>Cetak / Simpan PDF</button>
      </div>
      <article className={`receipt-paper receipt-paper--${paperWidth}`}>
        <header className="receipt-header">
          <h1>METTA-MART</h1>
          <p>Koperasi Sekolah</p>
          <p className="receipt-muted">Bukti transaksi</p>
        </header>
        {isCancelled && <div className="receipt-cancelled">TRANSAKSI DIBATALKAN</div>}
        <div className="receipt-meta">
          <div><span>No. Transaksi</span><b>{order.code}</b></div>
          <div><span>Tanggal</span><b>{dateTime(order.created_at)}</b></div>
          <div><span>Kanal</span><b>{order.sales_channel === "pos" ? "Kasir / POS" : "Pesanan online"}</b></div>
          <div><span>Pelanggan</span><b>{order.customer_name}</b></div>
          <div><span>Status pesanan</span><b>{orderStatus(order)}</b></div>
          <div><span>Status pembayaran</span><b>{paymentStatus(order)}</b></div>
        </div>
        <div className="receipt-rule" />
        <div className="receipt-items">
          {order.items.map((item) => (
            <div className="receipt-item" key={item.product_id}>
              <b>{item.product_name}</b>
              <div><span>{item.quantity} × {money(item.unit_price)}</span><strong>{money(item.line_total)}</strong></div>
            </div>
          ))}
        </div>
        <div className="receipt-rule" />
        <div className="receipt-totals">
          <div><span>Subtotal</span><b>{money(order.subtotal)}</b></div>
          {isGosend && <div><span>Ongkir GoSend</span><b>{order.delivery_fee_confirmed ? money(order.delivery_fee) : "Menunggu konfirmasi admin"}</b></div>}
          <div className="receipt-grand-total"><span>TOTAL</span><strong>{money(order.total)}</strong></div>
          <div><span>Metode pembayaran</span><b>{paymentMethod(order)}</b></div>
          {cash !== null && <>
            <div><span>Uang diterima</span><b>{money(cash)}</b></div>
            <div><span>Kembalian</span><b>{money(order.change_due ?? 0)}</b></div>
          </>}
        </div>
        {isGosend && <section className="receipt-delivery">
          <b>Informasi GoSend</b>
          <p>Penerima: {order.delivery_recipient}</p>
          <p>Telepon: {order.delivery_phone}</p>
          <p>Alamat: {order.delivery_address}</p>
        </section>}
        {order.note && <p className="receipt-note">Catatan: {order.note}</p>}
        <footer className="receipt-footer">
          <p>{isCancelled ? "Bukti transaksi yang telah dibatalkan." : "Terima kasih telah berbelanja!"}</p>
          <small>Simpan struk ini sebagai bukti transaksi.</small>
        </footer>
      </article>
      <p className="receipt-print-hint no-print">Untuk printer thermal, pastikan ukuran kertas pada pengaturan printer sesuai dengan pilihan di atas. Untuk PDF, pilih “Save as PDF” pada dialog cetak.</p>
    </main>
  );
}

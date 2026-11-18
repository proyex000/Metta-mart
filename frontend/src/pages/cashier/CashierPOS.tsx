import { useEffect, useMemo, useState } from "react";
import { Icon, PageTitle, ProductArt } from "../../components/ui";
import { categoryLabel } from "../../data/categories";
import { useProducts, productService } from "../../services/products";
import { closeShift, createCashMovement, getCurrentShift, openShift, posCheckout } from "../../services/commerce";
import type { ApiOrder, CashierShift } from "../../services/commerce";

const money = (value: number) => "Rp " + value.toLocaleString("id-ID");
const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function CashierPOS() {
  const products = useProducts();
  const [shift, setShift] = useState<CashierShift | null>(null);
  const [loadingShift, setLoadingShift] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [cashReceived, setCashReceived] = useState("0");
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [shiftNote, setShiftNote] = useState("");
  const [movementKind, setMovementKind] = useState<"cash_in" | "cash_out">("cash_in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementNote, setMovementNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<ApiOrder | null>(null);
  const [variance, setVariance] = useState<number | null>(null);

  const refreshShift = async () => {
    const response = await getCurrentShift();
    setShift(response.shift);
  };
  useEffect(() => {
    let active = true;
    getCurrentShift().then((response) => { if (active) setShift(response.shift); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Status shift tidak dapat dimuat."); })
      .finally(() => { if (active) setLoadingShift(false); });
    return () => { active = false; };
  }, []);

  const visibleProducts = useMemo(() => products.filter((product) => product.stock > 0 && product.name.toLowerCase().includes(search.trim().toLowerCase())), [products, search]);
  const cartProducts = products.filter((product) => (cart[product.id] || 0) > 0);
  const total = cartProducts.reduce((sum, product) => sum + product.price * cart[product.id], 0);
  const add = (id: number, delta: number) => {
    const stock = products.find((product) => product.id === id)?.stock ?? 0;
    setCart((current) => ({ ...current, [id]: Math.min(stock, Math.max(0, (current[id] || 0) + delta)) }));
  };

  const startShift = async () => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const opened = await openShift(Number(openingCash), shiftNote);
      setShift(opened); setShiftNote(""); setMessage("Shift berhasil dibuka.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Shift gagal dibuka."); }
    finally { setBusy(false); }
  };
  const recordMovement = async () => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await createCashMovement(movementKind, Number(movementAmount), movementNote);
      await refreshShift(); setMovementAmount(""); setMovementNote(""); setMessage("Pergerakan kas berhasil dicatat.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Pergerakan kas gagal dicatat."); }
    finally { setBusy(false); }
  };
  const finishShift = async () => {
    if (busy || !shift) return;
    if (!window.confirm("Tutup shift sekarang? Transaksi POS baru tidak dapat dibuat setelah shift ditutup.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const closed = await closeShift(Number(closingCash), shiftNote);
      setVariance(closed.variance); setShift(null); setClosingCash(""); setShiftNote("");
      setMessage("Shift ditutup. Selisih kas: " + money(closed.variance) + ".");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Shift gagal ditutup."); }
    finally { setBusy(false); }
  };
  const checkout = async () => {
    if (busy || !shift || !cartProducts.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const order = await posCheckout({ items: cartProducts.map((product) => ({ product_id: product.id, quantity: cart[product.id] })), cash_received: Number(cashReceived) });
      setReceipt(order); setCart({}); setCashReceived("0"); await productService.refresh(); await refreshShift();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Transaksi POS gagal."); }
    finally { setBusy(false); }
  };

  if (loadingShift) return <PageTitle title="POS Kasir" subtitle="Memeriksa status shift..." />;
  return <>
    <PageTitle title="POS Kasir" subtitle="Penjualan tunai, kontrol shift, dan pencatatan kas." />
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p className="payment-success" role="status">{message}</p>}
    {variance !== null && <p className="payment-help">Selisih kas terakhir: {money(variance)} (positif berarti uang fisik lebih, negatif berarti kurang).</p>}
    {!shift ? <section className="panel shift-open-panel"><h2>Buka Shift Kasir</h2><p>Hitung uang awal di laci sebelum mulai transaksi.</p><label>Saldo awal (Rp)<input type="number" min="0" step="1" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} /></label><label>Catatan (opsional)<input value={shiftNote} onChange={(event) => setShiftNote(event.target.value)} placeholder="Contoh: Shift pagi" /></label><button className="primary" disabled={busy || openingCash === "" || Number(openingCash) < 0} onClick={() => void startShift()}>{busy ? "Memproses..." : "Buka Shift"}</button></section> : <>
      <section className="shift-summary-grid"><article><small>Saldo Awal</small><strong>{money(shift.opening_cash)}</strong></article><article><small>Penjualan Tunai</small><strong>{money(shift.cash_sales)}</strong></article><article><small>Kas Masuk / Keluar</small><strong>{money(shift.cash_in)} / {money(shift.cash_out)}</strong></article><article><small>Kas Seharusnya</small><strong>{money(shift.expected_cash)}</strong></article></section>
      <div className="pos-layout"><section className="panel pos-catalog"><div className="panel__title"><h2>Katalog Produk</h2><span>{visibleProducts.length} produk</span></div><label className="search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk..." /></label><div className="pos-product-grid">{visibleProducts.map((product) => <button type="button" key={product.id} className="pos-product" onClick={() => add(product.id, 1)} disabled={(cart[product.id] || 0) >= product.stock}><ProductArt type={product.art} /><b>{product.name}</b><span>{categoryLabel(product.category)}</span><strong>{money(product.price)}</strong><small>Stok {product.stock}</small></button>)}</div>{!visibleProducts.length && <div className="empty-state">Tidak ada produk yang cocok atau stok kosong.</div>}</section>
      <aside className="panel pos-cart"><div className="panel__title"><h2>Keranjang</h2><span>{cartProducts.length} item</span></div>{cartProducts.map((product) => <div className="pos-cart-row" key={product.id}><div><b>{product.name}</b><small>{money(product.price)} × {cart[product.id]}</small></div><div className="quantity"><button onClick={() => add(product.id, -1)} aria-label="Kurangi">−</button><b>{cart[product.id]}</b><button onClick={() => add(product.id, 1)} aria-label="Tambah" disabled={cart[product.id] >= product.stock}>+</button></div></div>)}{!cartProducts.length && <div className="empty-state">Pilih produk untuk memulai transaksi.</div>}<div className="pos-cart-total"><span>Total</span><strong>{money(total)}</strong></div><label className="cash-received-field">Uang diterima (Rp)<input type="number" min={total} step="1" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} /></label><p className="change-preview">Kembalian: <b>{money(Math.max(0, Number(cashReceived || 0) - total))}</b></p><button className="primary wide" disabled={busy || !cartProducts.length || Number(cashReceived) < total} onClick={() => void checkout()}>{busy ? "Memproses..." : "Bayar Tunai & Selesaikan"}</button></aside></div>
      <section className="panel cash-control-panel"><div><h2>Pergerakan Kas</h2><p>Catat uang masuk/keluar yang bukan transaksi penjualan.</p></div><div className="cash-movement-form"><select value={movementKind} onChange={(event) => setMovementKind(event.target.value as "cash_in" | "cash_out")}><option value="cash_in">Kas masuk</option><option value="cash_out">Kas keluar</option></select><input type="number" min="1" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} placeholder="Jumlah Rupiah" /><input value={movementNote} onChange={(event) => setMovementNote(event.target.value)} placeholder="Alasan wajib diisi" /><button className="secondary-btn" disabled={busy || !movementNote.trim() || Number(movementAmount) <= 0} onClick={() => void recordMovement()}>Catat</button></div></section>
      <section className="panel shift-close-panel"><div><h2>Tutup Shift</h2><p>Hitung uang fisik, lalu masukkan jumlah aktual. Sistem akan mencatat selisih terhadap kas seharusnya.</p></div><div><input type="number" min="0" value={closingCash} onChange={(event) => setClosingCash(event.target.value)} placeholder="Uang fisik di laci (Rp)" /><input value={shiftNote} onChange={(event) => setShiftNote(event.target.value)} placeholder="Catatan penutupan (opsional)" /><button className="danger-btn" disabled={busy || closingCash === "" || Number(closingCash) < 0} onClick={() => void finishShift()}>Tutup Shift</button></div></section>
    </>}
    {receipt && <div className="modal-backdrop"><section className="modal pos-receipt" role="dialog" aria-modal="true"><h2>Transaksi Berhasil</h2><p className="receipt-code">{receipt.code}</p><p>{dateTime(receipt.created_at)}</p><div className="receipt-lines">{receipt.items.map((item) => <p key={item.id}><span>{item.product_name} × {item.quantity}</span><b>{money(item.line_total)}</b></p>)}</div><div className="pos-cart-total"><span>Total Tunai</span><strong>{money(receipt.total)}</strong></div><p>Uang diterima: <b>{money(receipt.payment.cash_received || 0)}</b></p><p>Kembalian: <b>{money(receipt.payment.change_due)}</b></p><p>Pembayaran tercatat lunas. Stok telah diperbarui.</p><div className="order-action-buttons"><button className="secondary-btn" onClick={() => window.print()}><Icon name="box" /> Cetak Struk</button><button className="primary" onClick={() => setReceipt(null)}>Transaksi Berikutnya</button></div></section></div>}
  </>;
}

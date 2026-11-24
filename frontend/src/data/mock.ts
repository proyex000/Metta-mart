import type { Order, Product } from "../types";

// Seed data for the prototype only. Replace with a backend/database source.
// The two "Seragam Sekolah" rows are SAMPLE items (names, prices, stock are placeholders).
export const products: Product[] = [
  { id: 1, name: "Buku Tulis", category: "buku", price: 5000, stock: 120, image_url: null, is_active: true, art: "book" },
  { id: 2, name: "Pensil 2B", category: "alat-tulis", price: 3000, stock: 50, image_url: null, is_active: true, art: "pencil" },
  { id: 3, name: "Penghapus", category: "alat-tulis", price: 2000, stock: 8, image_url: null, is_active: true, art: "eraser" },
  { id: 4, name: "Rautan", category: "alat-tulis", price: 4000, stock: 0, image_url: null, is_active: true, art: "sharpener" },
  { id: 5, name: "Minuman Botol", category: "minuman", price: 8000, stock: 35, image_url: null, is_active: true, art: "bottle" },
  {
    id: 6,
    name: "Kemeja Seragam Putih (contoh)",
    category: "seragam-sekolah",
    price: 85000,
    stock: 20,
    art: "shirt", image_url: null, is_active: true,
  },
  {
    id: 7,
    name: "Celana/Rok Seragam (contoh)",
    category: "seragam-sekolah",
    price: 90000,
    stock: 15,
    art: "shirt", image_url: null,
  },
];

export const orders: Order[] = [
  {
    code: "MTM-0128",
    date: "12 Okt 2025, 09:45",
    customer: "Andi Pratama",
    total: 8000,
    status: "Diproses",
  },
  {
    code: "MTM-0127",
    date: "11 Okt 2025, 14:20",
    customer: "Andi Pratama",
    total: 16000,
    status: "Siap Diambil",
  },
  {
    code: "MTM-0126",
    date: "10 Okt 2025, 10:15",
    customer: "Andi Pratama",
    total: 2000,
    status: "Selesai",
  },
];

export const notices = [
  {
    title: "Pesanan #MTM-0128 telah diterima",
    text: "Pesanan Anda sedang diproses oleh admin.",
    time: "12 Okt 2025, 09:45",
  },
  {
    title: "Stok Buku Tulis tersedia kembali",
    text: "Buku Tulis kembali tersedia dengan stok 120 pcs.",
    time: "12 Okt 2025, 08:30",
  },
  {
    title: "Promo alat tulis",
    text: "Diskon 10% untuk semua alat tulis hingga akhir bulan.",
    time: "11 Okt 2025, 15:20",
  },
  {
    title: "Pesanan #MTM-0126 telah dikirim",
    text: "Pesanan Anda sudah dalam perjalanan.",
    time: "10 Okt 2025, 16:30",
  },
  {
    title: "Informasi sekolah",
    text: "Jadwal kegiatan sekolah minggu ini telah diperbarui.",
    time: "10 Okt 2025, 10:00",
  },
];

export const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

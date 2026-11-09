import type { Order, Product, Role } from "../types";

export const demoAccounts: Record<Role, { identifier: string; password: string; name: string }> = {
  admin: { identifier: "admin@mettamart.id", password: "admin123", name: "Admin" },
  parent: { identifier: "parent@gmail.com", password: "parent123", name: "Ibu Sari" },
  student: { identifier: "12345678", password: "student123", name: "Andi Pratama" },
};

export const products: Product[] = [
  { id: 1, name: "Buku Tulis", category: "Buku", price: 5000, stock: 120, art: "book" },
  { id: 2, name: "Pensil 2B", category: "ATK", price: 3000, stock: 50, art: "pencil" },
  { id: 3, name: "Penghapus", category: "ATK", price: 2000, stock: 8, art: "eraser" },
  { id: 4, name: "Rautan", category: "ATK", price: 4000, stock: 0, art: "sharpener" },
  { id: 5, name: "Minuman Botol", category: "Minuman", price: 8000, stock: 35, art: "bottle" },
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
    status: "Dikirim",
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

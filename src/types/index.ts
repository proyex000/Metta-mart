export type Role = "admin" | "parent" | "student";

export type Session = {
  role: Role;
  name: string;
  email: string;
};

export type Product = {
  id: number;
  name: string;
  category: "ATK" | "Buku" | "Minuman";
  price: number;
  stock: number;
  art: string;
};

export type Order = {
  code: string;
  date: string;
  customer: string;
  total: number;
  status: "Menunggu Konfirmasi" | "Diproses" | "Dikirim" | "Selesai";
};

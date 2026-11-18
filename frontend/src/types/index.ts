import type { CategoryId } from "../data/categories";

export type Role = "admin" | "cashier" | "parent" | "student";

export type Session = {
  role: Role;
  name: string;
  email: string;
};

export type Product = {
  id: number;
  name: string;
  category: CategoryId;
  price: number;
  stock: number;
  art: string;
};

export type ProductInput = Omit<Product, "id" | "art"> & { art?: string };

export type Order = {
  code: string;
  date: string;
  customer: string;
  total: number;
  status: "Menunggu Konfirmasi" | "Diproses" | "Dikirim" | "Selesai";
};

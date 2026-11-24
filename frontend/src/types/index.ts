import type { CategoryId } from "../data/categories";

export type Role = "admin" | "parent" | "student";

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
  image_url: string | null;
  is_active: boolean;
};

export type ProductInput = Omit<Product, "id" | "art" | "image_url" | "is_active"> & { art?: string; stock_note?: string; image_file?: File | null; remove_image?: boolean };

export type Order = {
  code: string;
  date: string;
  customer: string;
  total: number;
  status: "Menunggu Konfirmasi" | "Diproses" | "Siap Diambil" | "Selesai";
};

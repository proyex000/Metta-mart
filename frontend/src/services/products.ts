import { useSyncExternalStore } from "react";
import { isCategoryId } from "../data/categories";
import { apiRequest } from "./api";
import type { Product, ProductInput } from "../types";

type ApiProduct = { id: number; name: string; category: Product["category"]; price: number; stock: number; is_active: boolean };
let items: Product[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const toProduct = (p: ApiProduct): Product => ({ id: p.id, name: p.name, category: p.category, price: p.price, stock: p.stock, art: p.category === "seragam-sekolah" ? "shirt" : p.category === "minuman" ? "bottle" : "book" });
function validate(input: ProductInput) {
  if (!input.name.trim()) throw new Error("Nama produk wajib diisi.");
  if (!isCategoryId(input.category)) throw new Error("Kategori tidak valid.");
  if (!Number.isInteger(input.price) || input.price < 0) throw new Error("Harga harus berupa bilangan bulat Rupiah (0 atau lebih).");
  if (!Number.isInteger(input.stock) || input.stock < 0) throw new Error("Stok harus berupa bilangan bulat (0 atau lebih).");
}
export async function refreshProducts() {
  const data = await apiRequest<ApiProduct[]>("/products/");
  items = data.filter((p) => p.is_active).map(toProduct);
  emit();
}
export const productService = {
  list: () => items,
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  async create(input: ProductInput): Promise<Product> {
    validate(input);
    const created = await apiRequest<ApiProduct>("/products/", { method: "POST", body: JSON.stringify({ name: input.name.trim(), category: input.category, price: input.price, stock: input.stock }) });
    const product = toProduct(created); items = [...items, product].sort((a,b) => a.name.localeCompare(b.name)); emit(); return product;
  },
  async update(id: number, input: ProductInput): Promise<Product> {
    validate(input);
    const updated = await apiRequest<ApiProduct>(`/products/${id}/`, { method: "PATCH", body: JSON.stringify({ name: input.name.trim(), category: input.category, price: input.price, stock: input.stock }) });
    const product = toProduct(updated); items = items.map((item) => item.id === id ? product : item); emit(); return product;
  },
  async remove(id: number) {
    await apiRequest<void>(`/products/${id}/`, { method: "DELETE" });
    items = items.filter((item) => item.id !== id); emit();
  },
};
export function useProducts(): Product[] { return useSyncExternalStore(productService.subscribe, productService.list, productService.list); }
export function stockLabel(stock: number): "Habis" | "Hampir Habis" | "Tersedia" { return stock === 0 ? "Habis" : stock < 10 ? "Hampir Habis" : "Tersedia"; }

import { useSyncExternalStore } from "react";
import { isCategoryId } from "../data/categories";
import { products as seed } from "../data/mock";
import type { Product, ProductInput } from "../types";

/**
 * Shared product store used by Admin, Student and Parent screens.
 *
 * This is an in-memory stand-in for a real products API. It exists so every
 * role reads the same data; it is NOT persistent and NOT a security boundary.
 * Replace the bodies of list/create/update/remove with API calls once the
 * backend exists; the validation here must be repeated on the server.
 */
let items: Product[] = seed.map((product) => ({ ...product }));
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function validate(input: ProductInput) {
  if (!input.name.trim()) throw new Error("Nama produk wajib diisi.");
  if (!isCategoryId(input.category)) throw new Error("Kategori tidak valid.");
  if (!Number.isInteger(input.price) || input.price < 0)
    throw new Error("Harga harus berupa bilangan bulat Rupiah (0 atau lebih).");
  if (!Number.isInteger(input.stock) || input.stock < 0)
    throw new Error("Stok harus berupa bilangan bulat (0 atau lebih).");
}

export const productService = {
  list: () => items,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  create(input: ProductInput): Product {
    validate(input);
    const product: Product = {
      id: items.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      name: input.name.trim(),
      category: input.category,
      price: input.price,
      stock: input.stock,
      art: input.art ?? (input.category === "seragam-sekolah" ? "shirt" : "book"),
    };
    items = [...items, product];
    emit();
    return product;
  },
  update(id: number, input: ProductInput): Product {
    validate(input);
    const current = items.find((item) => item.id === id);
    if (!current) throw new Error("Produk tidak ditemukan.");
    const next: Product = {
      ...current,
      name: input.name.trim(),
      category: input.category,
      price: input.price,
      stock: input.stock,
    };
    items = items.map((item) => (item.id === id ? next : item));
    emit();
    return next;
  },
  remove(id: number) {
    items = items.filter((item) => item.id !== id);
    emit();
  },
};

export function useProducts(): Product[] {
  return useSyncExternalStore(productService.subscribe, productService.list, productService.list);
}

export function stockLabel(stock: number): "Habis" | "Hampir Habis" | "Tersedia" {
  return stock === 0 ? "Habis" : stock < 10 ? "Hampir Habis" : "Tersedia";
}

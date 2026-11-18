import { useEffect, useSyncExternalStore } from "react";
import { isCategoryId } from "../data/categories";
import type { Product, ProductInput } from "../types";
import { adjustStock, createProduct, deleteProduct, listProducts, pageResults, setStock, updateProduct } from "./commerce";

let items: Product[] = [];
let loaded = false;
let loadingPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function fromApi(value: Awaited<ReturnType<typeof listProducts>> extends infer T ? T extends { results: (infer P)[] } ? P : T extends (infer P)[] ? P : never : never): Product {
  return {
    id: value.id,
    name: value.name,
    category: isCategoryId(value.category_slug) ? value.category_slug : "lainnya",
    price: value.price,
    stock: value.stock,
    art: value.category_slug === "seragam-sekolah" ? "shirt" : value.category_slug === "minuman" ? "bottle" : "book",
  };
}

function validate(input: ProductInput) {
  if (!input.name.trim()) throw new Error("Nama produk wajib diisi.");
  if (!isCategoryId(input.category)) throw new Error("Kategori tidak valid.");
  if (!Number.isSafeInteger(input.price) || input.price < 0) throw new Error("Harga harus berupa bilangan bulat Rupiah.");
  if (!Number.isSafeInteger(input.stock) || input.stock < 0) throw new Error("Stok harus berupa bilangan bulat nonnegatif.");
}

async function refresh(force = false) {
  if (loaded && !force) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const response = await listProducts();
    items = pageResults(response).map((item) => fromApi(item as Parameters<typeof fromApi>[0]));
    loaded = true;
    emit();
  })();
  try { await loadingPromise; } finally { loadingPromise = null; }
}

export const productService = {
  list: () => items,
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  refresh: () => refresh(true),
  async create(input: ProductInput): Promise<Product> {
    validate(input);
    const created = await createProduct({ name: input.name.trim(), category_slug: input.category, price: input.price });
    let current = created;
    if (input.stock > 0) current = await adjustStock(created.id, input.stock, "Stok awal produk");
    const product = fromApi(current as Parameters<typeof fromApi>[0]);
    items = [...items, product].sort((a, b) => a.name.localeCompare(b.name, "id"));
    loaded = true;
    emit();
    return product;
  },
  async update(id: number, input: ProductInput): Promise<Product> {
    validate(input);
    const previous = items.find((item) => item.id === id);
    if (!previous) throw new Error("Produk tidak ditemukan.");
    let updated = await updateProduct(id, { name: input.name.trim(), category_slug: input.category, price: input.price });
    if (input.stock !== previous.stock) updated = await setStock(id, input.stock, previous.stock, "Penyesuaian stok dari halaman katalog");
    const product = fromApi(updated as Parameters<typeof fromApi>[0]);
    items = items.map((item) => item.id === id ? product : item);
    emit();
    return product;
  },
  async remove(id: number) {
    await deleteProduct(id);
    items = items.filter((item) => item.id !== id);
    emit();
  },
};

export function useProducts(): Product[] {
  const value = useSyncExternalStore(productService.subscribe, productService.list, productService.list);
  useEffect(() => { void refresh().catch(() => undefined); }, []);
  return value;
}

export function stockLabel(stock: number): "Habis" | "Hampir Habis" | "Tersedia" {
  return stock === 0 ? "Habis" : stock < 10 ? "Hampir Habis" : "Tersedia";
}

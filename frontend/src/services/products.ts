import { useSyncExternalStore } from "react";
import { isCategoryId } from "../data/categories";
import { apiRequest } from "./api";
import type { Product, ProductInput } from "../types";

type ApiProduct = { id: number; name: string; category: Product["category"]; price: number; stock: number; is_active: boolean; image_url: string | null };
const MAX_IMAGE_DATA_URL_LENGTH = 380_000;
let items: Product[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const toProduct = (p: ApiProduct): Product => ({ id: p.id, name: p.name, category: p.category, price: p.price, stock: p.stock, image_url: p.image_url, art: p.category === "seragam-sekolah" ? "shirt" : p.category === "minuman" ? "bottle" : "book" });

async function compressProductImage(file: File): Promise<string> {
  let source: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let releaseSource = () => {};

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    source = bitmap;
    sourceWidth = bitmap.width;
    sourceHeight = bitmap.height;
    releaseSource = () => bitmap.close();
  } else {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("File gambar tidak dapat dibaca."));
        image.src = objectUrl;
      });
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
    source = image;
    sourceWidth = image.naturalWidth;
    sourceHeight = image.naturalHeight;
    releaseSource = () => URL.revokeObjectURL(objectUrl);
  }

  try {
    if (!sourceWidth || !sourceHeight) throw new Error("Dimensi gambar tidak valid.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak dapat memproses gambar.");

    // Match NEXT POS: resize on the client before sending the image to the API.
    for (const maxDimension of [640, 560, 480]) {
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.76, 0.7, 0.64, 0.58]) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) return dataUrl;
      }
    }
    throw new Error("Ukuran foto masih terlalu besar setelah dikompres. Coba gunakan foto lain.");
  } finally {
    releaseSource();
  }
}

async function productPayload(input: ProductInput): Promise<string> {
  const payload: Record<string, string | boolean> = {
    name: input.name.trim(),
    category: input.category,
    price: String(input.price),
    stock: String(input.stock),
    stock_note: input.stock_note || "",
  };
  if (input.image_file) payload.image = await compressProductImage(input.image_file);
  if (input.remove_image) payload.remove_image = true;
  return JSON.stringify(payload);
}
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
    const created = await apiRequest<ApiProduct>("/products/", { method: "POST", body: await productPayload(input) });
    const product = toProduct(created); items = [...items, product].sort((a,b) => a.name.localeCompare(b.name)); emit(); return product;
  },
  async update(id: number, input: ProductInput): Promise<Product> {
    validate(input);
    const updated = await apiRequest<ApiProduct>(`/products/${id}/`, { method: "PATCH", body: await productPayload(input) });
    const product = toProduct(updated); items = items.map((item) => item.id === id ? product : item); emit(); return product;
  },
  async remove(id: number) {
    await apiRequest<void>(`/products/${id}/`, { method: "DELETE" });
    items = items.filter((item) => item.id !== id); emit();
  },
};
export function useProducts(): Product[] { return useSyncExternalStore(productService.subscribe, productService.list, productService.list); }
export function stockLabel(stock: number): "Habis" | "Hampir Habis" | "Tersedia" { return stock === 0 ? "Habis" : stock < 10 ? "Hampir Habis" : "Tersedia"; }

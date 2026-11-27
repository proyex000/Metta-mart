import type { IconName } from "../components/ui";

/**
 * Single source of truth for product categories.
 * Admin, Student and Parent screens must read categories from here instead of
 * hardcoding their own lists. To add a category, append one entry below.
 */
export const categories = [
  { id: "alat-tulis", label: "Alat Tulis", icon: "pencil", legacy: ["ATK"] },
  { id: "buku", label: "Buku", icon: "book", legacy: [] },
  { id: "minuman", label: "Minuman", icon: "bottle", legacy: [] },
  { id: "seragam-sekolah", label: "Seragam Sekolah", icon: "shirt", legacy: ["Seragam"] },
  { id: "lainnya", label: "Lainnya", icon: "grid", legacy: [] },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: IconName;
  legacy: readonly string[];
}[];

export type CategoryId = (typeof categories)[number]["id"];

export const ALL_CATEGORIES = "semua" as const;

export function isCategoryId(value: unknown): value is CategoryId {
  return categories.some((category) => category.id === value);
}

export function categoryLabel(id: CategoryId): string {
  return categories.find((category) => category.id === id)?.label ?? id;
}

/**
 * Maps an old display name (e.g. "ATK") or a current id/label to a CategoryId.
 * Returns null when the value is unknown so callers can reject it explicitly.
 */
export function normalizeCategory(value: string): CategoryId | null {
  const needle = value.trim().toLowerCase();
  const match = categories.find(
    (category) =>
      category.id === needle ||
      category.label.toLowerCase() === needle ||
      category.legacy.some((legacy) => legacy.toLowerCase() === needle),
  );
  return match?.id ?? null;
}

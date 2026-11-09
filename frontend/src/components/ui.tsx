import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "box"
  | "bag"
  | "bell"
  | "chart"
  | "settings"
  | "search"
  | "user"
  | "logout"
  | "back"
  | "plus"
  | "menu";

const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  box: (
    <>
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
    </>
  ),
  bag: (
    <>
      <path d="M6 8h12l1 13H5L6 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),cd "E:\TUGAS"
Get-ChildItem -Force
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M4 12a8 8 0 0 1 .2-2l-2-1 2-4 2 1a8 8 0 0 1 3-2V2h5v2a8 8 0 0 1 3 2l2-1 2 4-2 1a8 8 0 0 1 0 4l2 1-2 4-2-1a8 8 0 0 1-3 2v2H9v-2a8 8 0 0 1-3-2l-2 1-2-4 2-1a8 8 0 0 1 0-2Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  back: <path d="m15 18-6-6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <img
        className="brand__image"
        src="/assets/mettamart-logo.png"
        alt="MettaMart — Sekolah Metta Maitreya"
      />
    </div>
  );
}

export function ProductArt({ type }: { type: string }) {
  return (
    <span className={`product-art product-art--${type}`} aria-hidden="true">
      <i />
    </span>
  );
}

export function Status({ children }: { children: ReactNode }) {
  const text = String(children);
  const tone =
    text.includes("Selesai") || text.includes("Tersedia")
      ? "green"
      : text.includes("Dikirim")
        ? "purple"
        : text.includes("Diproses")
          ? "blue"
          : text.includes("Habis")
            ? "red"
            : "amber";
  return <span className={`status status--${tone}`}>{children}</span>;
}

export function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="role-page-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

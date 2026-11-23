import { useEffect, type ReactNode } from "react";

export type IconName =
  | "home"
  | "box"
  | "bag"
  | "bell"
  | "chart"
  | "settings"
  | "search"
  | "user"
  | "users"
  | "logout"
  | "back"
  | "plus"
  | "menu"
  | "lock"
  | "shirt";

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
  ),

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
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
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
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" />
    </>
  ),
  shirt: <path d="m8 3-5 3 2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 0 1-8 0Z" />,
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

export function ProductArt({ type, imageUrl }: { type: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <span className="product-art product-art--photo">
        <img src={imageUrl} alt="Foto produk" loading="lazy" />
      </span>
    );
  }
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

export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel__title">
          <h2>{title}</h2>
          <button type="button" onClick={close} aria-label="Tutup">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

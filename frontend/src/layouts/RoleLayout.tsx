import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Brand, Icon, type IconName } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { Role } from "../types";
import "./RoleLayout.css";

const navigation: Record<Role, { to: string; label: string; icon: IconName }[]> = {
  admin: [
    { to: "/admin", label: "Dashboard", icon: "home" },
    { to: "/admin/stock", label: "Kelola Stok", icon: "box" },
    { to: "/admin/orders", label: "Pesanan", icon: "bag" },
    { to: "/admin/notifications", label: "Notifikasi", icon: "bell" },
    { to: "/admin/reports", label: "Laporan", icon: "chart" },
    { to: "/admin/settings", label: "Pengaturan", icon: "settings" },
  ],
  parent: [
    { to: "/parent", label: "Beranda", icon: "home" },
    { to: "/parent/stock", label: "Stok Barang", icon: "box" },
    { to: "/parent/orders", label: "Pesanan", icon: "bag" },
    { to: "/parent/notifications", label: "Notifikasi", icon: "bell" },
  ],
  student: [
    { to: "/student", label: "Beranda", icon: "home" },
    { to: "/student/stock", label: "Stok Barang", icon: "box" },
    { to: "/student/orders", label: "Pesanan Saya", icon: "bag" },
    { to: "/student/notifications", label: "Notifikasi", icon: "bell" },
  ],
};

export function RoleLayout({ role }: { role: Role }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const items = navigation[role];
  const exit = () => {
    logout();
    navigate("/login", { replace: true, state: { message: "Anda berhasil keluar." } });
  };

  return (
    <div className={`role-shell role-shell--${role}`}>
      <header className="role-mobile-header">
        <button aria-label="Buka menu" onClick={() => setMenuOpen(true)}>
          <Icon name="menu" />
        </button>
        <Brand compact />
        <span className="role-avatar">{session?.name.charAt(0)}</span>
      </header>
      <aside className={`role-sidebar ${menuOpen ? "open" : ""}`}>
        <button className="sidebar-close" onClick={() => setMenuOpen(false)}>
          ×
        </button>
        <Brand />
        <div className="role-label">
          {role === "admin" ? "Administrator" : role === "parent" ? "Orang Tua" : "Murid"}
        </div>
        <nav>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split("/").length === 2}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.label === "Notifikasi" && <em>5</em>}
            </NavLink>
          ))}
        </nav>
        <div className="role-account">
          <Link
            className="role-account-link"
            to={`/${role}/settings`}
            onClick={() => setMenuOpen(false)}
            aria-label="Buka pengaturan akun"
            title="Pengaturan akun"
          >
            <span className="role-avatar">{session?.name.charAt(0)}</span>
            <div>
              <b>{session?.name}</b>
              <small>{session?.email}</small>
              <small className="role-account-hint">Pengaturan akun</small>
            </div>
          </Link>
          <button aria-label="Keluar" title="Keluar" onClick={() => setConfirm(true)}>
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      {menuOpen && (
        <button className="menu-scrim" onClick={() => setMenuOpen(false)} aria-label="Tutup menu" />
      )}
      <main className="role-content">
        <Outlet />
      </main>
      <nav className="role-bottom-nav">
        {items.slice(0, 4).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to.split("/").length === 2}>
            <Icon name={item.icon} />
            <span>{item.label.replace(" Barang", "").replace(" Saya", "")}</span>
          </NavLink>
        ))}
      </nav>
      {confirm && (
        <div className="modal-backdrop">
          <div className="modal confirm-modal">
            <h2>Keluar dari MettaMart?</h2>
            <p>Sesi demo Anda akan diakhiri dan Anda akan kembali ke halaman login.</p>
            <div>
              <button className="secondary-btn" onClick={() => setConfirm(false)}>
                Batal
              </button>
              <button className="primary" onClick={exit}>
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { createBrowserRouter, Navigate, useLocation } from "react-router";
import {
  Dashboard,
  Notifications,
  Reports,
  Settings,
  Stock,
} from "../pages/admin/AdminPages";
import { Brand } from "../components/ui";
import { Orders as CommerceOrders } from "../pages/admin/OrderManagement";
import { useAuth } from "../hooks/useAuth";
import { RoleLayout } from "../layouts/RoleLayout";
import { LoginPage, RegisterPage, RoleChooser, SplashPage } from "../pages/auth/AuthPages";
import {
  ShopDashboard,
  ShopNotifications,
} from "../pages/shop/ShopPages";
import { CreateOrder, OrderDetail, ShopOrders, ShopStock } from "../pages/shop/ShopCommercePages";
import { ShopSettings } from "../pages/shop/ShopSettings";
import type { Role } from "../types";

function ProtectedRole({ role }: { role: Role }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="splash"><Brand /><span className="spinner" /><p>Memeriksa sesi...</p></div>;
  if (!session)
    return <Navigate to={`/login/${role}`} replace state={{ from: location.pathname }} />;
  if (session.role !== role) return <Navigate to={`/${session.role}`} replace />;
  return <RoleLayout role={role} />;
}

function SessionRedirect() {
  const { session, loading } = useAuth();
  if (loading) return <div className="splash"><Brand /><span className="spinner" /><p>Memeriksa sesi...</p></div>;
  return session ? <Navigate to={`/${session.role}`} replace /> : <SplashPage />;
}

function CashierHome() {
  return (
    <section className="role-page">
      <header className="role-page-title">
        <div>
          <h1>Dashboard Kasir</h1>
          <p>Akun kasir sudah aktif. Modul POS akan dibangun pada Phase 3.</p>
        </div>
      </header>
      <div className="empty-state">
        <h2>Modul kasir belum tersedia</h2>
        <p>Transaksi penjualan belum dapat dilakukan sampai POS dan manajemen shift selesai dibangun.</p>
      </div>
    </section>
  );
}

function NotFound() {
  const { session } = useAuth();
  return (
    <main className="not-found">
      <Brand />
      <strong>404</strong>
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
      <a className="primary" href={session ? `/${session.role}` : "/login"}>
        Kembali ke beranda
      </a>
    </main>
  );
}

function RoleNotFound() {
  const { session } = useAuth();
  return (
    <section className="role-not-found">
      <strong>404</strong>
      <h1>Halaman tidak ditemukan</h1>
      <p>Halaman ini tidak tersedia untuk peran Anda.</p>
      <a className="primary" href={`/${session?.role}`}>
        Kembali ke dashboard
      </a>
    </section>
  );
}

export const router = createBrowserRouter([
  { path: "/", Component: SessionRedirect },
  { path: "/login", Component: RoleChooser },
  { path: "/login/:role", Component: LoginPage },
  { path: "/register/:role", Component: RegisterPage },
  {
    path: "/admin",
    element: <ProtectedRole role="admin" />,
    children: [
      { index: true, Component: Dashboard },
      { path: "stock", Component: Stock },
      { path: "orders", Component: CommerceOrders },
      { path: "notifications", Component: Notifications },
      { path: "reports", Component: Reports },
      { path: "settings", Component: Settings },
      { path: "*", Component: RoleNotFound },
    ],
  },
  {
    path: "/cashier",
    element: <ProtectedRole role="cashier" />,
    children: [{ index: true, Component: CashierHome }, { path: "*", Component: RoleNotFound }],
  },
  {
    path: "/parent",
    element: <ProtectedRole role="parent" />,
    children: [
      { index: true, element: <ShopDashboard role="parent" /> },
      { path: "stock", element: <ShopStock role="parent" /> },
      { path: "order", element: <CreateOrder role="parent" /> },
      { path: "orders", element: <ShopOrders role="parent" /> },
      { path: "orders/:code", element: <OrderDetail role="parent" /> },
      { path: "notifications", Component: ShopNotifications },
      { path: "settings", element: <ShopSettings role="parent" /> },
      { path: "*", Component: RoleNotFound },
    ],
  },
  {
    path: "/student",
    element: <ProtectedRole role="student" />,
    children: [
      { index: true, element: <ShopDashboard role="student" /> },
      { path: "stock", element: <ShopStock role="student" /> },
      { path: "order", element: <CreateOrder role="student" /> },
      { path: "orders", element: <ShopOrders role="student" /> },
      { path: "orders/:code", element: <OrderDetail role="student" /> },
      { path: "notifications", Component: ShopNotifications },
      { path: "settings", element: <ShopSettings role="student" /> },
      { path: "*", Component: RoleNotFound },
    ],
  },
  { path: "*", Component: NotFound },
]);

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PageTitle } from "../../components/ui";
import { listNotifications, markAllNotificationsRead, markNotificationRead, pageResults, type ApiNotification } from "../../services/commerce";
import type { Role } from "../../types";

const dateTime = (value: string) => new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function NotificationCenter({ role }: { role: Role }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [busy, setBusy] = useState(false);
  const unreadCount = items.filter((item) => !item.read_at).length;

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const response = await listNotifications(nextPage);
      setItems(pageResults(response));
      setHasNext(!Array.isArray(response) && Boolean(response.next));
      setHasPrevious(!Array.isArray(response) && Boolean(response.previous));
      setPage(nextPage);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Notifikasi gagal dimuat."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(1); }, []);

  const target = (item: ApiNotification) => {
    if (role === "admin") return "/admin/orders";
    const match = item.target_url.match(/^\/orders\/([^/]+)$/);
    return match ? "/" + role + "/orders/" + encodeURIComponent(match[1]) : "/" + role;
  };
  const open = async (item: ApiNotification) => {
    if (!item.read_at) {
      try {
        const updated = await markNotificationRead(item.id);
        setItems((current) => current.map((value) => value.id === item.id ? updated : value));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Notifikasi gagal ditandai dibaca.");
        return;
      }
    }
    navigate(target(item));
  };
  const markAll = async () => {
    if (busy || unreadCount === 0) return;
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Notifikasi gagal diperbarui."); }
    finally { setBusy(false); }
  };

  return <>
    <PageTitle title="Notifikasi" subtitle="Pemberitahuan pesanan dan aktivitas akun." />
    <div className="panel notification-panel">
      <div className="panel__title"><div><h2>Pemberitahuan</h2><small>{unreadCount} belum dibaca pada halaman ini</small></div><button className="secondary-btn" disabled={busy || unreadCount === 0} onClick={() => void markAll()}>{busy ? "Memproses..." : "Tandai semua dibaca"}</button></div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {loading ? <p className="empty-state">Memuat notifikasi...</p> : items.length ? <div className="notification-list-live">{items.map((item) => <button type="button" key={item.id} className={"notification-live-item " + (!item.read_at ? "unread" : "")} onClick={() => void open(item)}><span className="notification-live-dot" /><span className="notification-live-copy"><b>{item.title}</b><span>{item.body}</span><small>{dateTime(item.created_at)}</small></span><span className="notification-live-arrow">›</span></button>)}</div> : <div className="empty-state"><h2>Belum ada notifikasi</h2><p>Pemberitahuan baru akan muncul ketika ada aktivitas pesanan.</p></div>}
      <div className="pagination-controls"><button className="secondary-btn" disabled={!hasPrevious || loading} onClick={() => void load(page - 1)}>Sebelumnya</button><span>Halaman {page}</span><button className="secondary-btn" disabled={!hasNext || loading} onClick={() => void load(page + 1)}>Selanjutnya</button></div>
    </div>
  </>;
}

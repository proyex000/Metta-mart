import { useState } from "react";
import { Link } from "react-router";
import { Icon, PageTitle } from "../../components/ui";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types";
import "./ShopSettings.css";

type ShopRole = Exclude<Role, "admin">;

const defaultPreferences = {
  orderUpdates: true,
  stockUpdates: true,
  promotions: false,
  weeklySummary: true,
};

export function ShopSettings({ role }: { role: ShopRole }) {
  const { session, updateProfile } = useAuth();
  const storageKey = `mettamart-settings-${role}`;
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? { ...defaultPreferences, ...JSON.parse(saved) } : defaultPreferences;
    } catch {
      return defaultPreferences;
    }
  });
  const [saved, setSaved] = useState(false);
  const [profileName, setProfileName] = useState(session?.name || "");
  const [profileEmail, setProfileEmail] = useState(session?.email || "");
  const [profileSaved, setProfileSaved] = useState(false);
  const isParent = role === "parent";

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileName.trim() || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(profileEmail.trim())) return;
    updateProfile({ name: profileName, email: profileEmail });
    setProfileSaved(true);
  };

  const updatePreference = (key: keyof typeof defaultPreferences, checked: boolean) => {
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSaved(true);
  };

  return (
    <div className="shop-settings-page">
      <PageTitle
        title="Pengaturan"
        subtitle="Kelola informasi akun dan preferensi MettaMart Anda."
        action={<Link className="shop-settings-back" to={`/${role}`}>Kembali ke beranda</Link>}
      />

      <section className="shop-settings-profile">
        <span className="shop-settings-avatar">{session?.name?.charAt(0).toUpperCase() || "M"}</span>
        <div className="shop-settings-profile-copy">
          <span className="shop-settings-eyebrow">{isParent ? "AKUN ORANG TUA" : "AKUN SISWA"}</span>
          <h2>{session?.name || "Pengguna MettaMart"}</h2>
          <p>{session?.email || "Email belum tersedia"}</p>
        </div>
        <span className="shop-settings-role">{isParent ? "Orang Tua" : "Siswa"}</span>
      </section>

      <div className="shop-settings-grid">
        <section className="shop-settings-card">
          <div className="shop-settings-card-heading">
            <span className="shop-settings-icon"><Icon name="user" /></span>
            <div>
              <h2>Informasi profil</h2>
              <p>Informasi akun yang digunakan untuk masuk.</p>
            </div>
          </div>
          <form className="shop-settings-profile-form" onSubmit={saveProfile}>
            <label className="shop-settings-field">
              <span>Nama lengkap</span>
              <input required value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </label>
            <label className="shop-settings-field">
              <span>Email akun</span>
              <input required type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
            </label>
            <div className="shop-settings-field">
              <span>Jenis akun</span>
              <strong>{isParent ? "Orang Tua" : "Siswa"}</strong>
            </div>
            <button className="shop-settings-save-button" type="submit">Simpan profil</button>
            {profileSaved && <p className="shop-settings-save-state" role="status">Profil diperbarui untuk sesi ini.</p>}
            <p className="shop-settings-note">Data profil tersimpan di browser pada prototipe ini. Sinkronisasi server memerlukan API backend.</p>
          </form>
        </section>

        <section className="shop-settings-card">
          <div className="shop-settings-card-heading">
            <span className="shop-settings-icon"><Icon name="bell" /></span>
            <div>
              <h2>Preferensi notifikasi</h2>
              <p>Pilih informasi yang ingin Anda terima.</p>
            </div>
          </div>
          <div className="shop-settings-toggle-row">
            <div><strong>Update pesanan</strong><span>Perubahan status pesanan Anda.</span></div>
            <input aria-label="Notifikasi update pesanan" type="checkbox" checked={preferences.orderUpdates} onChange={(event) => updatePreference("orderUpdates", event.target.checked)} />
          </div>
          <div className="shop-settings-toggle-row">
            <div><strong>Informasi stok</strong><span>Produk baru dan ketersediaan barang.</span></div>
            <input aria-label="Notifikasi informasi stok" type="checkbox" checked={preferences.stockUpdates} onChange={(event) => updatePreference("stockUpdates", event.target.checked)} />
          </div>
          <div className="shop-settings-toggle-row">
            <div><strong>Promo dan informasi</strong><span>Pengumuman dan penawaran MettaMart.</span></div>
            <input aria-label="Notifikasi promo" type="checkbox" checked={preferences.promotions} onChange={(event) => updatePreference("promotions", event.target.checked)} />
          </div>
          {isParent && (
            <div className="shop-settings-toggle-row">
              <div><strong>Ringkasan mingguan</strong><span>Ringkasan aktivitas belanja anak.</span></div>
              <input aria-label="Ringkasan mingguan" type="checkbox" checked={preferences.weeklySummary} onChange={(event) => updatePreference("weeklySummary", event.target.checked)} />
            </div>
          )}
          <p className="shop-settings-save-state" role="status">{saved ? "Preferensi tersimpan di perangkat ini." : "Perubahan preferensi tersimpan otomatis."}</p>
        </section>

        <section className="shop-settings-card shop-settings-security">
          <div className="shop-settings-card-heading">
            <span className="shop-settings-icon"><Icon name="settings" /></span>
            <div>
              <h2>Keamanan akun</h2>
              <p>Jaga keamanan akses akun MettaMart.</p>
            </div>
          </div>
          <div className="shop-settings-security-row">
            <div><strong>Kata sandi</strong><span>Jika perlu mengganti kata sandi, hubungi administrator sekolah.</span></div>
            <span className="shop-settings-managed">Dikelola admin</span>
          </div>
          <div className="shop-settings-security-row">
            <div><strong>Status sesi</strong><span>Akun sedang digunakan pada sesi ini.</span></div>
            <span className="shop-settings-active">Aktif</span>
          </div>
        </section>
      </div>
    </div>
  );
}

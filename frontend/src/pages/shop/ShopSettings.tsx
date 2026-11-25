import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Icon, PageTitle } from "../../components/ui";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { useAuth } from "../../hooks/useAuth";
import { getNotificationPreferences, saveNotificationPreferences } from "../../services/auth";
import type { AccountNotificationPreferences } from "../../services/api";
import type { Role } from "../../types";
import "./ShopSettings.css";

type ShopRole = Exclude<Role, "admin">;

export function ShopSettings({ role }: { role: ShopRole }) {
  const { session, updateProfile } = useAuth();
  const [profileName, setProfileName] = useState(session?.name || "");
  const [profileEmail, setProfileEmail] = useState(session?.email || "");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [preferences, setPreferences] = useState<AccountNotificationPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const isParent = role === "parent";

  useEffect(() => {
    let active = true;
    getNotificationPreferences()
      .then((value) => { if (active) setPreferences(value); })
      .catch((reason) => {
        if (active) setPreferencesError(reason instanceof Error ? reason.message : "Preferensi notifikasi gagal dimuat.");
      })
      .finally(() => { if (active) setPreferencesLoading(false); });
    return () => { active = false; };
  }, []);

  const updatePreference = async (key: keyof AccountNotificationPreferences, checked: boolean) => {
    if (!preferences || preferencesSaving) return;
    const previous = preferences;
    setPreferences({ ...previous, [key]: checked });
    setPreferencesSaving(true);
    setPreferencesError("");
    setPreferencesSaved(false);
    try {
      const updated = await saveNotificationPreferences({ [key]: checked });
      setPreferences(updated);
      setPreferencesSaved(true);
    } catch (reason) {
      setPreferences(previous);
      setPreferencesError(reason instanceof Error ? reason.message : "Preferensi notifikasi gagal disimpan.");
    } finally {
      setPreferencesSaving(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaved(false);
    if (!profileName.trim()) {
      setProfileError("Nama lengkap wajib diisi.");
      return;
    }
    // Parent accounts use email as their login identifier. Student email is optional.
    if (isParent && !profileEmail.trim()) {
      setProfileError("Email orang tua wajib diisi.");
      return;
    }
    if (profileEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail.trim())) {
      setProfileError("Masukkan alamat email yang valid.");
      return;
    }
    setProfileError("");
    try {
      await updateProfile({ name: profileName, email: profileEmail });
      setProfileSaved(true);
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : "Profil gagal diperbarui.");
    }
  };

  return (
    <div className="shop-settings-page">
      <PageTitle
        title="Pengaturan"
        subtitle="Kelola informasi akun dan keamanan MettaMart Anda."
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
              <span>{isParent ? "Email akun" : "Email kontak (opsional)"}</span>
              <input required={isParent} type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
            </label>
            <div className="shop-settings-field">
              <span>Jenis akun</span>
              <strong>{isParent ? "Orang Tua" : "Siswa"}</strong>
            </div>
            <button className="shop-settings-save-button" type="submit">Simpan profil</button>
            {profileError && <p className="auth-error" role="alert">{profileError}</p>}
            {profileSaved && <p className="shop-settings-save-state" role="status">Profil berhasil diperbarui di server.</p>}
          </form>
        </section>

        <section className="shop-settings-card">
          <div className="shop-settings-card-heading">
            <span className="shop-settings-icon"><Icon name="bell" /></span>
            <div>
              <h2>Preferensi notifikasi</h2>
              <p>Pilih informasi yang ingin Anda terima di akun ini.</p>
            </div>
          </div>
          {preferencesLoading && <p className="shop-settings-preferences-status">Memuat preferensi notifikasi...</p>}
          {!preferencesLoading && preferences && (
            <>
              <div className="shop-settings-toggle-row">
                <div><strong>Update pesanan</strong><span>Perubahan status dan pembayaran pesanan Anda.</span></div>
                <input aria-label="Notifikasi update pesanan" type="checkbox" checked={preferences.order_updates} disabled={preferencesSaving} onChange={(event) => void updatePreference("order_updates", event.target.checked)} />
              </div>
              <div className="shop-settings-toggle-row">
                <div><strong>Informasi stok</strong><span>Produk baru dan produk yang tersedia kembali.</span></div>
                <input aria-label="Notifikasi informasi stok" type="checkbox" checked={preferences.stock_updates} disabled={preferencesSaving} onChange={(event) => void updatePreference("stock_updates", event.target.checked)} />
              </div>
              <div className="shop-settings-toggle-row">
                <div><strong>Promo dan informasi</strong><span>Pengumuman dan informasi promosi MettaMart.</span></div>
                <input aria-label="Notifikasi promo" type="checkbox" checked={preferences.promotions} disabled={preferencesSaving} onChange={(event) => void updatePreference("promotions", event.target.checked)} />
              </div>
              {isParent && (
                <div className="shop-settings-toggle-row">
                  <div><strong>Ringkasan mingguan</strong><span>Ringkasan aktivitas pesanan akun Anda setiap minggu.</span></div>
                  <input aria-label="Ringkasan mingguan" type="checkbox" checked={preferences.weekly_summary} disabled={preferencesSaving} onChange={(event) => void updatePreference("weekly_summary", event.target.checked)} />
                </div>
              )}
              <p className="shop-settings-preferences-status" role="status">{preferencesSaving ? "Menyimpan perubahan..." : preferencesSaved ? "Preferensi tersimpan di akun Anda." : "Preferensi tersimpan di server dan berlaku di perangkat lain."}</p>
            </>
          )}
          {preferencesError && <p className="shop-settings-preferences-error" role="alert">{preferencesError}</p>}
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
            <div><strong>Kata sandi</strong><span>Ganti password sendiri. Admin tidak dapat melihat atau mengubah password Anda.</span></div>
          </div>
          <ChangePasswordForm />
          <div className="shop-settings-security-row">
            <div><strong>Status sesi</strong><span>Akun sedang digunakan pada sesi ini.</span></div>
            <span className="shop-settings-active">Aktif</span>
          </div>
        </section>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Icon, PageTitle } from "../../components/ui";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types";
import "./ShopSettings.css";

type ShopRole = Exclude<Role, "admin">;

export function ShopSettings({ role }: { role: ShopRole }) {
  const { session, updateProfile } = useAuth();
  const [profileName, setProfileName] = useState(session?.name || "");
  const [profileEmail, setProfileEmail] = useState(session?.email || "");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const isParent = role === "parent";

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

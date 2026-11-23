import { useState } from "react";
import { changePassword } from "../services/auth";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async () => {
    setError("");
    setSuccess("");
    if (!currentPassword || !newPassword || !confirmation) {
      setError("Lengkapi semua kolom password.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("Konfirmasi password baru tidak sama.");
      return;
    }
    setBusy(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSuccess("Password berhasil diperbarui.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password gagal diperbarui.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="password-change">
      <div className="password-change__fields">
        <label>Password lama<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label>Password baru<input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
        <label>Konfirmasi password baru<input type="password" autoComplete="new-password" minLength={10} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      </div>
      <p className="password-change__hint">Gunakan password yang kuat dan berbeda dari password lama. Aturan kekuatan password divalidasi oleh server.</p>
      <button type="button" className="primary" onClick={submit} disabled={busy}>{busy ? "Menyimpan..." : "Ganti password"}</button>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && <p className="password-change__success" role="status">{success}</p>}
    </div>
  );
}

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createManagedUser, fetchManagedUsers, updateManagedUser, type ManagedUser } from "../../services/accounts";
import "./AdminUsersPage.css";

const roleLabel: Record<ManagedUser["role"], string> = {
  admin: "Admin",
  student: "Siswa",
  parent: "Orang tua",
};

export function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editIdentifier, setEditIdentifier] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagedUser["role"]>("student");
  const [password, setPassword] = useState("");
  const [confirmUser, setConfirmUser] = useState<ManagedUser | null>(null);

  const refresh = async () => {
    const rows = await fetchManagedUsers();
    setUsers(rows);

  };

  useEffect(() => {
    refresh()
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Daftar akun gagal dimuat."))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !needle || user.full_name.toLowerCase().includes(needle) || user.identifier.toLowerCase().includes(needle);
      return matchesQuery && (roleFilter === "all" || user.role === roleFilter);
    });
  }, [users, query, roleFilter]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const created = await createManagedUser({
        identifier: identifier.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        role,
        password,
      });
      setUsers((current) => [...current, created].sort((a, b) => a.full_name.localeCompare(b.full_name)));

      setIdentifier("");
      setFullName("");
      setEmail("");
      setPassword("");
      setNotice(`Akun ${created.full_name} berhasil dibuat.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Akun gagal dibuat.");
    } finally {
      setWorking(false);
    }
  };

  const startEditing = (user: ManagedUser) => {
    setEditingUserId(user.id);
    setEditName(user.full_name);
    setEditIdentifier(user.role === "student" ? user.identifier : "");
    setError("");
    setNotice("");
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditName("");
    setEditIdentifier("");
  };

  const saveUserChanges = async (user: ManagedUser) => {
    const nextName = editName.trim();
    const nextIdentifier = editIdentifier.trim();
    if (!nextName || working) return;
    if (user.role === "student" && !/^\d{10}$/.test(nextIdentifier)) return;
    const changes: { full_name?: string; identifier?: string } = {};
    if (nextName !== user.full_name) changes.full_name = nextName;
    if (user.role === "student" && nextIdentifier !== user.identifier) changes.identifier = nextIdentifier;
    if (!Object.keys(changes).length) {
      cancelEditing();
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateManagedUser(user.id, changes);
      setUsers((current) => current.map((row) => row.id === updated.id ? updated : row));
      setNotice(`Perubahan akun ${updated.full_name} berhasil disimpan.`);
      cancelEditing();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Perubahan akun gagal disimpan.");
    } finally {
      setWorking(false);
    }
  };

  const toggleActive = (user: ManagedUser) => {
    if (working) return;
    setConfirmUser(user);
  };

  const confirmToggleActive = async () => {
    if (!confirmUser || working) return;
    const user = confirmUser;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateManagedUser(user.id, { is_active: !user.is_active });
      setUsers((current) => current.map((row) => row.id === updated.id ? updated : row));
      setNotice(`Akun ${updated.full_name} sekarang ${updated.is_active ? "aktif" : "nonaktif"}.`);
      setConfirmUser(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Status akun gagal diperbarui.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="admin-users-page">
      <header className="role-page-title">
        <div>
          <h1>Pengelolaan Akun</h1>
          <p>Buat akun, perbarui nama atau NISN siswa, dan atur status akun.</p>
        </div>
      </header>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}

      <section className="panel admin-users-create">
        <div className="panel__title"><h2>Buat Akun</h2></div>
        <form onSubmit={submit} className="admin-users-form">
          <label>Jenis akun
            <select value={role} onChange={(event) => setRole(event.target.value as ManagedUser["role"])}>
              <option value="student">Siswa</option>
              <option value="parent">Orang tua</option>
              <option value="admin">Admin koperasi</option>
            </select>
          </label>
          <label>{role === "student" ? "NISN" : role === "parent" ? "Email orang tua (untuk login)" : "Identitas login"}
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} required maxLength={100} placeholder={role === "student" ? "10 digit NISN" : "Email / identitas login"} />
          </label>
          <label>Nama lengkap
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={150} />
          </label>
          <label>Email kontak (opsional)
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} />
          </label>
          <label>Password awal
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete="new-password" />
          </label>
          <button className="primary" type="submit" disabled={working || !identifier.trim() || !fullName.trim() || password.length < 10}>
            {working ? "Menyimpan..." : "Buat Akun"}
          </button>
        </form>
        <p className="admin-users-help">NISN siswa harus terdiri dari 10 digit dan tidak boleh sama dengan akun lain. Password awal dapat diganti oleh pemilik akun setelah masuk.</p>
      </section>

      <section className="panel admin-users-list">
        <div className="panel__title">
          <h2>Daftar Pengguna</h2>
          <small className="admin-users-count">{users.length} akun</small>
        </div>
        <div className="admin-users-toolbar">
          <label className="search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau identitas login..." />
          </label>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter jenis akun">
            <option value="all">Semua jenis akun</option>
            <option value="student">Siswa</option>
            <option value="parent">Orang tua</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {loading ? <p>Memuat daftar akun...</p> : (
          <div className="desktop-table">
            <table>
              <thead><tr><th>Nama</th><th>Identitas login</th><th>Jenis</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {shown.map((user) => (
                  <tr key={user.id} className={editingUserId === user.id ? "is-editing" : ""}>
                    <td>
                      {editingUserId === user.id ? (
                        <input aria-label={`Nama ${user.identifier}`} value={editName} maxLength={150} onChange={(event) => setEditName(event.target.value)} />
                      ) : <span className="admin-users-name">{user.full_name}</span>}
                    </td>
                    <td>
                      {editingUserId === user.id && user.role === "student" ? (
                        <input
                          aria-label={`NISN ${user.full_name}`}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={10}
                          value={editIdentifier}
                          onChange={(event) => setEditIdentifier(event.target.value.replace(/\D/g, "").slice(0, 10))}
                        />
                      ) : <span className="admin-users-identifier">{user.identifier}</span>}
                    </td>
                    <td><span className={`admin-users-role admin-users-role--${user.role}`}>{roleLabel[user.role]}</span></td>
                    <td><span className={`status ${user.is_active ? "status--green" : "status--red"}`}>{user.is_active ? "Aktif" : "Nonaktif"}</span></td>
                    <td>
                      <div className="admin-users-actions">
                        {editingUserId === user.id ? (
                          <>
                            <button type="button" className="primary small" disabled={working || !editName.trim() || (user.role === "student" && !/^\d{10}$/.test(editIdentifier))} onClick={() => saveUserChanges(user)}>{working ? "Menyimpan..." : "Simpan"}</button>
                            <button type="button" className="secondary small" disabled={working} onClick={cancelEditing}>Batal</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="secondary small" disabled={working || editingUserId !== null} onClick={() => startEditing(user)}>Edit</button>
                            <button type="button" className={user.is_active ? "danger small" : "primary small"} disabled={working || editingUserId !== null} onClick={() => toggleActive(user)}>{user.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !shown.length && <p className="table-foot">Tidak ada akun yang cocok. Coba ubah kata kunci atau filter.</p>}
      </section>

      {confirmUser && (
        <div className="admin-users-modal-backdrop" onClick={() => !working && setConfirmUser(null)}>
          <section
            className="admin-users-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-users-confirm-title"
            aria-describedby="admin-users-confirm-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`admin-users-confirm-icon ${confirmUser.is_active ? "is-warning" : "is-success"}`} aria-hidden="true">
              {confirmUser.is_active ? "!" : "✓"}
            </div>
            <h2 id="admin-users-confirm-title">{confirmUser.is_active ? "Nonaktifkan akun?" : "Aktifkan akun?"}</h2>
            <p id="admin-users-confirm-description">
              {confirmUser.is_active
                ? <>Akun <strong>{confirmUser.full_name}</strong> akan dinonaktifkan dan tidak dapat digunakan untuk masuk sampai diaktifkan kembali.</>
                : <>Akun <strong>{confirmUser.full_name}</strong> akan diaktifkan kembali dan dapat digunakan untuk masuk.</>}
            </p>
            <div className="admin-users-confirm-actions">
              <button type="button" className="secondary" disabled={working} onClick={() => setConfirmUser(null)}>Batal</button>
              <button
                type="button"
                className={confirmUser.is_active ? "danger" : "primary"}
                disabled={working}
                onClick={confirmToggleActive}
              >
                {working ? "Memproses..." : confirmUser.is_active ? "Ya, Nonaktifkan" : "Ya, Aktifkan"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

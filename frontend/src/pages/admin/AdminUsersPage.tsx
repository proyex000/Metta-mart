import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";
import "./AdminUsersPage.css";

type AdminUser = {
  id: number;
  identifier: string;
  full_name: string;
  email: string;
  role: "admin" | "student" | "parent";
  is_active: boolean;
  date_joined: string;
};

const roleLabel: Record<AdminUser["role"], string> = {
  admin: "Admin",
  student: "Siswa",
  parent: "Orang tua",
};

async function loadUsers() {
  return apiRequest<AdminUser[]>("/admin/users/");
}

async function createUser(input: {
  identifier: string;
  full_name: string;
  email: string;
  role: AdminUser["role"];
  password: string;
}) {
  return apiRequest<AdminUser>("/admin/users/", {
    method: "POST",
    body: JSON.stringify({ ...input, is_active: true }),
  });
}

async function updateUser(user: AdminUser, changes: { full_name?: string; is_active?: boolean }) {
  return apiRequest<AdminUser>(`/admin/users/${user.id}/`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("student");
  const [password, setPassword] = useState("");

  const refresh = async () => {
    const rows = await loadUsers();
    setUsers(rows);
    setDraftNames(Object.fromEntries(rows.map((user) => [user.id, user.full_name])));
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
      const created = await createUser({
        identifier: identifier.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        role,
        password,
      });
      setUsers((current) => [...current, created].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setDraftNames((current) => ({ ...current, [created.id]: created.full_name }));
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

  const saveName = async (user: AdminUser) => {
    const nextName = (draftNames[user.id] || "").trim();
    if (!nextName || nextName === user.full_name || working) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateUser(user, { full_name: nextName });
      setUsers((current) => current.map((row) => row.id === updated.id ? updated : row));
      setNotice(`Nama akun ${updated.identifier} diperbarui.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nama akun gagal diperbarui.");
    } finally {
      setWorking(false);
    }
  };

  const toggleActive = async (user: AdminUser) => {
    if (working) return;
    const action = user.is_active ? "menonaktifkan" : "mengaktifkan";
    if (!window.confirm(`Yakin ingin ${action} akun ${user.full_name}?`)) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateUser(user, { is_active: !user.is_active });
      setUsers((current) => current.map((row) => row.id === updated.id ? updated : row));
      setNotice(`Akun ${updated.full_name} sekarang ${updated.is_active ? "aktif" : "nonaktif"}.`);
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
          <p>Buat, perbarui nama, dan nonaktifkan akun pengguna koperasi.</p>
        </div>
      </header>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-success" role="status">{notice}</p>}

      <section className="panel admin-users-create">
        <div className="panel__title"><h2>Buat Akun</h2></div>
        <form onSubmit={submit} className="admin-users-form">
          <label>Jenis akun
            <select value={role} onChange={(event) => setRole(event.target.value as AdminUser["role"])}>
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
        <p className="table-foot">Perubahan peran dan identitas login tidak tersedia dari layar ini. Siswa harus memakai NISN 10 digit; orang tua memakai email.</p>
      </section>

      <section className="panel admin-users-list">
        <div className="panel__title">
          <h2>Daftar Pengguna</h2>
          <small>{users.length} akun</small>
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
                  <tr key={user.id}>
                    <td>
                      <input aria-label={`Nama ${user.identifier}`} value={draftNames[user.id] ?? user.full_name} onChange={(event) => setDraftNames((current) => ({ ...current, [user.id]: event.target.value }))} />
                      {draftNames[user.id] !== user.full_name && <button className="secondary small" disabled={working || !(draftNames[user.id] || "").trim()} onClick={() => saveName(user)}>Simpan nama</button>}
                    </td>
                    <td>{user.identifier}</td>
                    <td>{roleLabel[user.role]}</td>
                    <td><span className={`status ${user.is_active ? "status--green" : "status--red"}`}>{user.is_active ? "Aktif" : "Nonaktif"}</span></td>
                    <td><button className={user.is_active ? "secondary small" : "primary small"} disabled={working} onClick={() => toggleActive(user)}>{user.is_active ? "Nonaktifkan" : "Aktifkan"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !shown.length && <p className="table-foot">Tidak ada akun yang cocok dengan pencarian.</p>}
      </section>
    </div>
  );
}

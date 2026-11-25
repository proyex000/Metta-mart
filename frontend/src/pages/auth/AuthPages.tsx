import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { Brand, Icon } from "../../components/ui";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types";

const roleCopy: Record<Role, { title: string; identifier: string; helper: string }> = {
  student: { title: "Siswa", identifier: "NISN (10 digit)", helper: "Login / Daftar sebagai siswa" },
  parent: { title: "Orang Tua", identifier: "Email", helper: "Login / Daftar sebagai orang tua" },
  admin: { title: "Admin", identifier: "Email", helper: "Login sebagai administrator" },
};

const publicRoles: Exclude<Role, "admin">[] = ["student", "parent"];

function validRole(value: string | undefined): value is Role {
  return value === "admin" || value === "parent" || value === "student";
}

export function RoleChooser() {
  const location = useLocation();
  return (
    <div className="auth-page">
      <div className="auth-card role-choice">
        <Brand />
        <h1>Selamat Datang!</h1>
        <p>Pilih peran Anda untuk melanjutkan</p>
        {location.state?.message && <div className="auth-success">{location.state.message}</div>}
        <div className="role-options">
          {publicRoles.map((role) => (
            <Link key={role} to={`/login/${role}`}>
              <span className="role-option-icon"><Icon name="user" size={28} /></span>
              <div>
                <b>{roleCopy[role].title}</b>
                <small>{roleCopy[role].helper}</small>
              </div>
              <span>›</span>
            </Link>
          ))}
        </div>
        <small className="role-choice-note">Akun admin dibuat oleh administrator koperasi.</small>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const { session, loading: sessionLoading, login } = useAuth();
  const selected = validRole(role) ? role : null;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!selected) return <Navigate to="/login" replace />;
  if (sessionLoading) return <div className="splash"><Brand /><span className="spinner" /><p>Memeriksa sesi...</p></div>;
  if (session) return <Navigate to={`/${session.role}`} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!identifier.trim() || !password) {
      setError("Isi identitas dan password.");
      return;
    }
    setSubmitting(true);
    try {
      await login(selected, identifier, password);
      navigate(`/${selected}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login gagal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/login" className="auth-back"><Icon name="back" /> Ganti peran</Link>
        <Brand />
        <h1>Login {roleCopy[selected].title}</h1>
        <p>Masuk dengan akun Anda</p>
        <form onSubmit={submit} noValidate>
          {error && <div className="auth-error">{error}</div>}
          <label>
            {roleCopy[selected].identifier}
            <div className="auth-input">
              <Icon name="user" />
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required />
            </div>
          </label>
          <label>
            Password
            <div className="auth-input">
              <Icon name="lock" />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </div>
          </label>
          <button className="primary wide" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Memeriksa akun...</> : "Login"}
          </button>
        </form>
        {(selected === "student" || selected === "parent") && (
          <p className="auth-switch">Belum punya akun? <Link to={`/register/${selected}`}>Daftar di sini</Link></p>
        )}
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const { register } = useAuth();
  const selected = role === "student" || role === "parent" ? role : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!selected) return <Navigate to="/login" replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get("identifier") || "").trim();
    const fullName = String(data.get("name") || "").trim();
    const password = String(data.get("password") || "");
    if (!identifier || !fullName || password.length < 10) {
      setError("Lengkapi data. Password minimal 10 karakter.");
      return;
    }
    setSubmitting(true);
    try {
      await register({ role: selected, identifier, fullName, password });
      navigate(`/${selected}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pendaftaran gagal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to={`/login/${selected}`} className="auth-back"><Icon name="back" /> Kembali</Link>
        <Brand />
        <h1>Daftar {roleCopy[selected].title}</h1>
        <p>Buat akun baru untuk melanjutkan</p>
        <form onSubmit={submit}>
          {error && <div className="auth-error">{error}</div>}
          <label>
            {roleCopy[selected].identifier}
            <div className="auth-input"><Icon name="user" /><input name="identifier" required placeholder={roleCopy[selected].identifier} /></div>
          </label>
          <label>
            Nama Lengkap
            <div className="auth-input"><Icon name="user" /><input name="name" required placeholder="Nama lengkap" /></div>
          </label>
          <label>
            Password
            <div className="auth-input"><Icon name="lock" /><input name="password" type="password" required minLength={10} placeholder="Minimal 10 karakter" /></div>
          </label>
          <button className="primary wide" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Membuat akun...</> : "Daftar"}
          </button>
        </form>
        <p className="auth-switch">Sudah punya akun? <Link to={`/login/${selected}`}>Login di sini</Link></p>
      </div>
    </div>
  );
}

export function SplashPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setTimeout(() => navigate("/login", { replace: true }), 900);
    return () => clearTimeout(timer);
  }, [navigate]);
  return <div className="splash"><Brand /><span className="spinner" /><p>Menyiapkan MettaMart...</p></div>;
}

import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import { Brand, Icon } from "../../components/ui";
import { demoAccounts } from "../../data/mock";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types";

const roleCopy: Record<Role, { title: string; identifier: string; helper: string }> = {
  student: { title: "Siswa", identifier: "NISN", helper: "Login / Daftar sebagai siswa" },
  parent: { title: "Wali", identifier: "Email Gmail", helper: "Login / Daftar sebagai wali" },
  admin: { title: "Owner / Admin", identifier: "Email", helper: "Login / Daftar sebagai admin" },
};

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
          {(["student", "parent", "admin"] as Role[]).map((role) => (
            <Link key={role} to={`/login/${role}`}>
              <span className="role-option-icon">
                <Icon name={role === "admin" ? "settings" : "user"} size={28} />
              </span>
              <div>
                <b>{roleCopy[role].title}</b>
                <small>{roleCopy[role].helper}</small>
              </div>
              <span>›</span>
            </Link>
          ))}
        </div>
        <small className="demo-warning">
          Prototipe ini menggunakan autentikasi mock, bukan keamanan produksi.
        </small>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const { session, login } = useAuth();
  const selected = validRole(role) ? role : null;
  const [identifier, setIdentifier] = useState(selected ? demoAccounts[selected].identifier : "");
  const [password, setPassword] = useState(selected ? demoAccounts[selected].password : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!selected) return <Navigate to="/login" replace />;
  if (session) return <Navigate to={`/${session.role}`} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!identifier.trim() || password.length < 6) {
      setError("Isi identitas dan password minimal 6 karakter.");
      return;
    }
    setLoading(true);
    try {
      await login(selected, identifier, password);
      navigate(`/${selected}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login gagal.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/login" className="auth-back">
          <Icon name="back" /> Ganti peran
        </Link>
        <Brand />
        <h1>Login {roleCopy[selected].title}</h1>
        <p>Masuk dengan akun Anda</p>
        <form onSubmit={submit} noValidate>
          {error && <div className="auth-error">{error}</div>}
          <label>
            {roleCopy[selected].identifier}
            <div className="auth-input">
              <Icon name="user" />
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
              />
            </div>
          </label>
          <label>
            Password
            <div className="auth-input">
              <Icon name="settings" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
          </label>
          <button className="primary wide" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" /> Memeriksa akun...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>
        <p className="auth-switch">
          Belum punya akun? <Link to={`/register/${selected}`}>Daftar di sini</Link>
        </p>
        <div className="demo-account">
          <b>Akun demo</b>
          <span>{demoAccounts[selected].identifier}</span>
          <span>Password: {demoAccounts[selected].password}</span>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const selected = validRole(role) ? role : null;
  const [done, setDone] = useState(false);
  if (!selected) return <Navigate to="/login" replace />;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (String(data.get("password")).length < 6) return;
    setDone(true);
    setTimeout(() => navigate(`/login/${selected}`), 900);
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to={`/login/${selected}`} className="auth-back">
          <Icon name="back" /> Kembali
        </Link>
        <Brand />
        <h1>Daftar {roleCopy[selected].title}</h1>
        <p>Buat akun baru untuk melanjutkan</p>
        {done ? (
          <div className="auth-success">Pendaftaran demo berhasil. Mengarahkan ke login...</div>
        ) : (
          <form onSubmit={submit}>
            <label>
              {roleCopy[selected].identifier}
              <div className="auth-input">
                <Icon name="user" />
                <input name="identifier" required placeholder={roleCopy[selected].identifier} />
              </div>
            </label>
            <label>
              Nama Lengkap
              <div className="auth-input">
                <Icon name="user" />
                <input name="name" required placeholder="Nama lengkap" />
              </div>
            </label>
            <label>
              Password
              <div className="auth-input">
                <Icon name="settings" />
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Minimal 6 karakter"
                />
              </div>
            </label>
            <button className="primary wide">Daftar</button>
          </form>
        )}
        <p className="auth-switch">
          Sudah punya akun? <Link to={`/login/${selected}`}>Login di sini</Link>
        </p>
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
  return (
    <div className="splash">
      <Brand />
      <span className="spinner" />
      <p>Menyiapkan MettaMart...</p>
    </div>
  );
}

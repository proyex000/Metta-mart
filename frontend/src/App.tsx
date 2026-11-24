import { Component, type ErrorInfo, type ReactNode } from "react";
import { RouterProvider } from "react-router";
import { AuthProvider } from "./hooks/useAuth";
import { router } from "./app/routes";

type ErrorBoundaryState = { hasError: boolean };

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MettaMart UI error", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="not-found" role="alert">
          <strong>Terjadi kendala</strong>
          <h1>Halaman tidak dapat ditampilkan</h1>
          <p>Muat ulang aplikasi. Jika masalah berlanjut, hubungi admin koperasi.</p>
          <button className="primary" type="button" onClick={() => window.location.reload()}>
            Muat Ulang
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppErrorBoundary>
  );
}

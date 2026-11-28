import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
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


function SoundEffects() {
  useEffect(() => {
    let audioContext: AudioContext | null = null;

    const getAudioContext = () => {
      if (typeof window === "undefined" || !("AudioContext" in window)) return null;
      audioContext ??= new AudioContext();
      if (audioContext.state === "suspended") void audioContext.resume();
      return audioContext;
    };

    const playTone = (frequency: number, startAt: number, duration: number, volume: number) => {
      const context = getAudioContext();
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.01);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button, input[type='button'], input[type='submit'], input[type='reset']");
      if (!button || button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true" || button.hasAttribute("data-sound-off")) return;
      const context = getAudioContext();
      if (context) playTone(660, context.currentTime, 0.045, 0.035);
    };

    const onSuccess = () => {
      const context = getAudioContext();
      if (!context) return;
      const start = context.currentTime + 0.015;
      playTone(523.25, start, 0.13, 0.065);
      playTone(659.25, start + 0.105, 0.13, 0.065);
      playTone(783.99, start + 0.21, 0.19, 0.065);
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("mettamart:success-sound", onSuccess);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("mettamart:success-sound", onSuccess);
      if (audioContext) void audioContext.close();
    };
  }, []);

  return null;
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <SoundEffects />
        <RouterProvider router={router} />
      </AuthProvider>
    </AppErrorBoundary>
  );
}

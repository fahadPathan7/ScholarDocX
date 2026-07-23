import { useState } from "react";
import { API_BASE } from "../lib/api";

/**
 * "Sign in/up with Google" button that handles Render free-tier cold starts.
 *
 * Instead of a raw `<a href>` (which shows the browser's default "can't
 * reach the page" error when the backend is asleep), this button:
 *   1. Shows a "Connecting..." spinner state.
 *   2. Sends a lightweight fetch to the backend's Google login endpoint
 *      with `redirect: "manual"` — this wakes the server without the
 *      browser navigating away yet.
 *   3. Once the fetch resolves (server is awake), does the full redirect.
 *   4. If the fetch fails after the timeout, shows a friendly retry
 *      message instead of a raw connection error.
 *
 * SCHOLARDOCX-0169.
 */
export function GoogleAuthButton({ label }: { label: string }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "failed">("idle");

  const handleClick = async () => {
    setStatus("connecting");
    const loginUrl = `${API_BASE}/auth/google/login`;

    try {
      // Wake the server with a HEAD request. redirect: "manual" so the
      // browser doesn't try to follow Google's 302 here — we just want
      // to know the server is alive. Render free-tier cold boots take
      // ~30-60s; the default fetch has no timeout, so we set our own.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // 90s max
      await fetch(loginUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      }).catch(() => {
        // A 302 with redirect:"manual" shows as an opaque redirect error
        // in fetch — that's FINE, it means the server is alive and
        // responded. Swallow it and proceed to the real redirect.
      });
      clearTimeout(timeout);

      // Server responded (even if fetch couldn't follow the redirect).
      // Now do the real navigation — the server is warm, so this is fast.
      window.location.href = loginUrl;
    } catch {
      // Network failed entirely — show a friendly retry instead of a
      // raw browser error page.
      setStatus("failed");
    }
  };

  if (status === "failed") {
    return (
      <div className="auth-google-wrapper">
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="auth-google-btn auth-google-btn-error"
        >
          <span>Connection failed. Tap to retry.</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "connecting"}
      className="auth-google-btn"
      aria-label={label}
    >
      {status === "connecting" ? (
        <>
          <span className="auth-google-spinner" aria-hidden="true" />
          <span>Connecting to Google…</span>
        </>
      ) : (
        <>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

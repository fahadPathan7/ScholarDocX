import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { decodeToken, setToken } from "../lib/auth";
import { SplashScreen } from "./SplashScreen";
import "./AuthCompletePage.css";

/**
 * Landing route for the Google OAuth callback.
 *
 * The backend (`/api/auth/google/callback`) mints the existing JWT and
 * redirects the browser here with `?token=...` (success) or `?error=...`
 * (failure).
 *
 * On success we store the token and do a **hard redirect** to `/dashboard`
 * (not a React Router navigate). This forces a full page reload so the
 * AuthProvider's initAuth() picks up the token from storage on a fresh
 * mount — avoiding a race where ProtectedRoute sees stale
 * isAuthenticated=false and bounces to the landing page.
 *
 * SCHOLARDOCX-0169.
 */
export function AuthCompletePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      navigate("/login", { replace: true, state: { oauthError: err } });
      return;
    }

    if (!token) {
      navigate("/login", {
        replace: true,
        state: { oauthError: "Google sign-in did not return a session. Please try again." },
      });
      return;
    }

    // Validate the token is well-formed before storing it.
    const payload = decodeToken(token);
    if (!payload || !payload.user_id) {
      navigate("/login", {
        replace: true,
        state: { oauthError: "Google sign-in produced an invalid session. Please try again." },
      });
      return;
    }

    // Store the token, then hard-redirect. A full page reload ensures
    // AuthProvider.initAuth() runs on a clean mount WITH the token in
    // storage, so ProtectedRoute never sees a stale unauthenticated state.
    setToken(token, true);
    window.location.href = "/dashboard";
  }, [params, navigate]);

  return <SplashScreen message="Completing sign-in…" />;
}

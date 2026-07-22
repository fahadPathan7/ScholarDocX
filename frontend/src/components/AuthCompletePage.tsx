import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { decodeToken, setToken } from "../lib/auth";
import { api } from "../lib/api";
import type { User } from "../lib/auth";
import { SplashScreen } from "./SplashScreen";
import "./AuthCompletePage.css";

/**
 * Landing route for the Google OAuth callback.
 *
 * The backend (`/api/auth/google/callback`) mints the existing JWT and
 * redirects the browser here with `?token=...` (success) or `?error=...`
 * (failure). This component:
 *   - success: persists the token, hydrates AuthContext, navigates to /dashboard
 *   - failure: redirects to /login with the error message
 *
 * SCHOLARDOCX-0169.
 */
export function AuthCompletePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      // Bounce to /login with the message via router state so the
      // LoginPage can surface it in its existing alert slot.
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

    // Optimistically hydrate from the token payload, then refresh from
    // /auth/me in the background — mirrors the password-login path in
    // AuthContext.login().
    const payload = decodeToken(token);
    if (!payload || !payload.user_id) {
      navigate("/login", {
        replace: true,
        state: { oauthError: "Google sign-in produced an invalid session. Please try again." },
      });
      return;
    }

    setToken(token, true);
    const optimisticUser: User = {
      id: payload.user_id,
      email: payload.email,
      display_name: payload.display_name,
      roles: payload.roles || [],
    };
    login(token, optimisticUser, true);

    // Refresh latest server-side fields, then go to the dashboard.
    api.get<User>("/auth/me")
      .then(() => navigate("/dashboard", { replace: true }))
      .catch(() => navigate("/dashboard", { replace: true }));
  }, [params, navigate, login]);

  if (error) {
    return (
      <div className="auth-complete-page">
        <p className="auth-complete-error">{error}</p>
      </div>
    );
  }

  return <SplashScreen message="Completing sign-in…" />;
}

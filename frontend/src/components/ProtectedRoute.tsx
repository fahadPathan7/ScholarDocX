import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { SplashScreen } from "./SplashScreen";

interface ProtectedRouteProps {
  roles?: string[];
}

export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <SplashScreen message="Authenticating..." />;
  }

  if (!isAuthenticated || !user) {
    // Not authenticated — send anonymous visitors to the public landing page
    // (which hosts the login/register entry points) instead of straight to /login.
    return <Navigate to="/" replace />;
  }

  if (roles && roles.length > 0) {
    const hasRequiredRole = roles.some((role) => user.roles.includes(role));
    if (!hasRequiredRole) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
          <h2>Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      );
    }
  }

  return <Outlet />;
}

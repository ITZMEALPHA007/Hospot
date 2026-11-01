import { Navigate } from "react-router-dom";

export function SessionProtectedRoute({ loading, authenticated, children }) {
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-600">Restoring your secure session…</div>;
  return authenticated ? children : <Navigate to="/login" replace />;
}

export function RoleProtectedRoute({ user, role, children, redirectTo = "/home" }) {
  return user?.role === role ? children : <Navigate to={redirectTo} replace />;
}

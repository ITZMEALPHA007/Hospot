import { Navigate } from "react-router-dom";
import { dashboardPathForRole } from "./dashboardRoutes";

export function DashboardRedirect({ user }) {
  return <Navigate to={dashboardPathForRole(user?.role)} replace />;
}

export function DashboardAccess({ user, requestedRole, children }) {
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== requestedRole) {
    return <Navigate to={dashboardPathForRole(user.role)} replace />;
  }
  return children;
}

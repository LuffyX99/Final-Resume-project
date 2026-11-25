import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { roleHome } from "../auth/roles";
import type { UserRole } from "../types";
import SessionLoader from "./SessionLoader";

export default function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <SessionLoader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <>{children}</>;
}

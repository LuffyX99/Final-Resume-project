import { Navigate } from "react-router-dom";
import { useAdminAuth } from "../auth/AdminAuthContext";
import SessionLoader from "./SessionLoader";

export default function AdminProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { admin, loading } = useAdminAuth();

  if (loading) {
    return <SessionLoader />;
  }

  if (!admin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

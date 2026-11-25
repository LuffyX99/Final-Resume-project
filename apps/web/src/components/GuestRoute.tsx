import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { roleHome } from "../auth/roles";
import SessionLoader from "./SessionLoader";

export default function GuestRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <SessionLoader />;
  }

  if (user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <>{children}</>;
}

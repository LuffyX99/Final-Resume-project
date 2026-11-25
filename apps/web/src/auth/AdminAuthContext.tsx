import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  adminLogin,
  clearStoredAdminToken,
  getAdminMe,
  getStoredAdminToken,
  storeAdminToken,
} from "../api/client";
import type { AdminUser } from "../types";

interface AdminAuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  signInAdmin: (id: string, password: string) => Promise<AdminUser>;
  signOutAdmin: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getStoredAdminToken()));

  useEffect(() => {
    if (!getStoredAdminToken()) {
      return;
    }
    getAdminMe()
      .then(setAdmin)
      .catch(() => {
        clearStoredAdminToken();
        setAdmin(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleExpired() {
      setAdmin(null);
    }
    window.addEventListener("admin:expired", handleExpired);
    return () => window.removeEventListener("admin:expired", handleExpired);
  }, []);

  const signInAdmin = useCallback(
    async (id: string, password: string): Promise<AdminUser> => {
      const response = await adminLogin({ id, password });
      storeAdminToken(response.access_token);
      setAdmin(response.admin);
      return response.admin;
    },
    [],
  );

  const signOutAdmin = useCallback(() => {
    clearStoredAdminToken();
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      loading,
      signInAdmin,
      signOutAdmin,
    }),
    [admin, loading, signInAdmin, signOutAdmin],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  }
  return context;
}

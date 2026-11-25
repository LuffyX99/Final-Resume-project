import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearStoredToken,
  getCurrentUser,
  getStoredToken,
  login as loginRequest,
  storeToken,
} from "../api/client";
import type { AuthUser, LoginResponse } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  startSession: (response: LoginResponse) => void;
  refreshUser: () => Promise<AuthUser>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getStoredToken()));

  useEffect(() => {
    if (!getStoredToken()) {
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => clearStoredToken())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleExpired() {
      setUser(null);
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  const startSession = useCallback((response: LoginResponse) => {
    storeToken(response.access_token);
    setUser(response.user);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await loginRequest({ email, password });
      startSession(response);
      return response.user;
    },
    [startSession],
  );

  const refreshUser = useCallback(async () => {
    const next = await getCurrentUser();
    setUser(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    clearStoredToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signIn,
      startSession,
      refreshUser,
      signOut,
    }),
    [user, loading, signIn, startSession, refreshUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

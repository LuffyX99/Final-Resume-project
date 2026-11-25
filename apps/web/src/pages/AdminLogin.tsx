import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../auth/AdminAuthContext";
import { errorMessage } from "../api/client";

export default function AdminLogin() {
  const { admin, signInAdmin } = useAdminAuth();
  const navigate = useNavigate();

  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (admin) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [admin, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!adminId.trim()) {
      setError("Please enter your Admin ID");
      return;
    }
    if (!password) {
      setError("Please enter your Admin password");
      return;
    }

    try {
      setLoading(true);
      await signInAdmin(adminId.trim(), password);
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-8 animate-fade-in">
      <div className="rounded-2xl border border-base-700/60 bg-base-900/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neon/10 border border-neon/30 text-neon shadow-[0_0_20px_rgba(0,240,255,0.2)]">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-neon">
            Privileged Access
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-base-50 mt-1">
            Admin Portal Login
          </h1>
          <p className="mt-2 text-xs text-base-400">
            Enter platform administration credentials configured in your environment.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3.5 text-xs text-rose-accent flex items-start gap-2.5"
          >
            <svg
              className="w-4 h-4 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-id"
              className="block font-mono text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5"
            >
              Admin ID
            </label>
            <input
              id="admin-id"
              type="text"
              autoComplete="username"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="e.g. admin or configured ADMIN_ID"
              className="w-full rounded-xl border border-base-700 bg-base-950 px-4 py-2.5 text-sm text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="admin-password"
              className="block font-mono text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-xl border border-base-700 bg-base-950 px-4 py-2.5 text-sm text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-xl bg-neon py-2.5 text-sm font-semibold text-base-950 shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:bg-neon/90 disabled:opacity-50 transition-all"
          >
            {loading ? "Authenticating..." : "Sign In to Admin Console"}
          </button>
        </form>

        <div className="mt-8 border-t border-base-800 pt-6 text-center">
          <Link
            to="/login"
            className="text-xs text-base-400 hover:text-neon transition-colors"
          >
            &larr; Return to Candidate & Recruiter Login
          </Link>
        </div>
      </div>
    </div>
  );
}

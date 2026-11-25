import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getAdminUsers,
  updateAdminUserStatus,
  errorMessage,
} from "../api/client";
import DataTable from "../components/DataTable";
import type { AdminUserItem } from "../types";

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User detail modal
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);

  // Status toggle confirmation
  const [actionUser, setActionUser] = useState<AdminUserItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadUsers(targetPage = page) {
    try {
      setLoading(true);
      setError(null);
      const isAct =
        activeFilter === "active" ? true : activeFilter === "inactive" ? false : undefined;
      const data = await getAdminUsers({
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        is_active: isAct,
        page: targetPage,
        limit: 10,
      });
      setUsers(data.items);
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(targetPage);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers(1);
  }, [roleFilter, activeFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadUsers(1);
  }

  async function confirmToggleStatus() {
    if (!actionUser) return;
    try {
      setActionBusy(true);
      setActionError(null);
      const updated = await updateAdminUserStatus(
        actionUser.id,
        !actionUser.is_active,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u)),
      );
      if (selectedUser?.id === updated.id) {
        setSelectedUser(updated);
      }
      setActionUser(null);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  const columns = [
    {
      key: "user",
      header: "User",
      render: (item: AdminUserItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.full_name}</div>
          <div className="font-mono text-xs text-base-400">{item.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (item: AdminUserItem) => {
        const roleColor =
          item.role === "admin"
            ? "bg-rose-accent/10 border-rose-accent/30 text-rose-accent"
            : item.role === "recruiter"
            ? "bg-amber-accent/10 border-amber-accent/30 text-amber-accent"
            : "bg-neon/10 border-neon/30 text-neon";
        return (
          <span
            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${roleColor}`}
          >
            {item.role}
          </span>
        );
      },
    },
    {
      key: "details",
      header: "Affiliation / Activity",
      render: (item: AdminUserItem) => (
        <div className="text-xs text-base-300">
          {item.role === "recruiter" ? (
            <div>
              <span className="font-medium text-base-100">
                {item.company_name || "Independent Recruiter"}
              </span>
              <span className="text-base-500 block">
                {item.jobs_count} job{item.jobs_count === 1 ? "" : "s"} posted
              </span>
            </div>
          ) : (
            <div>
              <span className="font-medium text-base-100">
                {item.resumes_count} resume{item.resumes_count === 1 ? "" : "s"}
              </span>
              <span className="text-base-500 block">
                {item.applications_count} application{item.applications_count === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: AdminUserItem) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            item.is_active
              ? "bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/30"
              : "bg-rose-accent/10 text-rose-accent border border-rose-accent/30"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              item.is_active ? "bg-emerald-accent" : "bg-rose-accent"
            }`}
          />
          {item.is_active ? "Active" : "Deactivated"}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Joined",
      render: (item: AdminUserItem) => (
        <span className="text-xs text-base-400 font-mono">
          {new Date(item.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: AdminUserItem) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedUser(item)}
            className="rounded-lg border border-base-700 bg-base-800 px-2.5 py-1 text-xs font-medium text-base-200 hover:border-base-600 hover:text-base-50 transition-colors"
          >
            Details
          </button>
          <button
            onClick={() => {
              setActionError(null);
              setActionUser(item);
            }}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              item.is_active
                ? "border-rose-accent/30 bg-rose-accent/10 text-rose-accent hover:bg-rose-accent/20"
                : "border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/20"
            }`}
          >
            {item.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/admin" className="text-xs font-mono text-neon hover:underline">
              &larr; Admin Nerve Center
            </Link>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-base-50">
            User & Recruiter Directory
          </h1>
          <p className="text-xs text-base-400 mt-1">
            Browse all {total} accounts, inspect activity, and control platform access.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-base-900/60 border border-base-800 p-4 rounded-xl">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by candidate name or email..."
            className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
          />
          <button
            type="submit"
            className="rounded-lg bg-base-800 border border-base-700 px-4 py-2 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-xs text-base-200 focus:border-neon focus:outline-none"
          >
            <option value="">All Roles</option>
            <option value="candidate">Candidates</option>
            <option value="recruiter">Recruiters</option>
            <option value="admin">Admins</option>
          </select>

          {/* Status Filter */}
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-xs text-base-200 focus:border-neon focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-4 text-xs text-rose-accent"
        >
          {error}
        </div>
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={users}
        keyExtractor={(item) => item.id}
        page={page}
        onPageChange={(newPage) => loadUsers(newPage)}
        hasMore={hasMore}
        emptyMessage={loading ? "Loading users..." : "No users matched the criteria."}
      />

      {/* User Details Modal */}
      {selectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md animate-fade-in"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-base-700/60 pb-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-neon">
                  User Profile Inspection
                </p>
                <h3 className="font-display text-lg font-bold text-base-50">
                  {selectedUser.full_name}
                </h3>
                <p className="font-mono text-xs text-base-400">{selectedUser.email}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-1 text-base-400 hover:text-base-100"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-400 block mb-1">Role</span>
                <span className="font-semibold uppercase text-neon">{selectedUser.role}</span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-400 block mb-1">Status</span>
                <span className={selectedUser.is_active ? "text-emerald-accent font-semibold" : "text-rose-accent font-semibold"}>
                  {selectedUser.is_active ? "Active" : "Deactivated"}
                </span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-400 block mb-1">Phone Number</span>
                <span className="text-base-200">{selectedUser.phone_number || "None listed"}</span>
              </div>
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3">
                <span className="text-base-400 block mb-1">Age / Gender</span>
                <span className="text-base-200">
                  {selectedUser.age ? `${selectedUser.age} yrs` : "N/A"} / {selectedUser.gender || "N/A"}
                </span>
              </div>
            </div>

            {selectedUser.role === "recruiter" && (
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3 text-xs space-y-1">
                <span className="text-base-400 block">Recruiter Affiliation</span>
                <p className="font-semibold text-base-100">{selectedUser.company_name || "Individual"}</p>
                {selectedUser.industry && (
                  <p className="text-base-400">Industry: {selectedUser.industry}</p>
                )}
                <p className="text-amber-accent font-mono">{selectedUser.jobs_count} job postings created</p>
              </div>
            )}

            {selectedUser.role === "candidate" && (
              <div className="rounded-xl border border-base-800 bg-base-950/60 p-3 text-xs space-y-1">
                <span className="text-base-400 block">Candidate Activity</span>
                <p className="text-base-200">{selectedUser.resumes_count} resume files uploaded</p>
                <p className="text-neon font-mono">{selectedUser.applications_count} job applications submitted</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedUser(null)}
                className="rounded-lg bg-base-800 border border-base-700 px-4 py-2 text-xs font-semibold text-base-200 hover:text-base-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Activate/Deactivate */}
      {actionUser && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md animate-fade-in"
          onClick={() => setActionUser(null)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-base-700 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-bold text-base-50">
              {actionUser.is_active ? "Deactivate Account?" : "Reactivate Account?"}
            </h3>
            <p className="text-xs text-base-300 leading-relaxed">
              {actionUser.is_active
                ? `Deactivating ${actionUser.full_name} (${actionUser.email}) will immediately block their login and API access.`
                : `Reactivating ${actionUser.full_name} (${actionUser.email}) will restore their ability to log in and use the platform.`}
            </p>

            {actionError && (
              <div className="rounded-lg border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setActionUser(null)}
                disabled={actionBusy}
                className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmToggleStatus}
                disabled={actionBusy}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                  actionUser.is_active
                    ? "bg-rose-accent text-base-950 hover:bg-rose-accent/90"
                    : "bg-emerald-accent text-base-950 hover:bg-emerald-accent/90"
                }`}
              >
                {actionBusy
                  ? "Processing..."
                  : actionUser.is_active
                  ? "Confirm Deactivation"
                  : "Confirm Reactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

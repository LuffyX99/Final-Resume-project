import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getAdminMetrics,
  getAdminUsers,
  updateAdminUserStatus,
  errorMessage,
} from "../api/client";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import DataTable from "../components/DataTable";
import type { AdminMetrics, AdminUserItem } from "../types";

export default function AdminPanel() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [errorMetrics, setErrorMetrics] = useState<string | null>(null);

  // Platform users state
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errorUsers, setErrorUsers] = useState<string | null>(null);

  // User detail modal & action modal
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [actionUser, setActionUser] = useState<AdminUserItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const data = await getAdminMetrics();
      setMetrics(data);
    } catch (err) {
      setErrorMetrics(errorMessage(err));
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  const loadUsers = useCallback(async (targetPage = 1, currentRole = roleFilter, currentSearch = searchQuery) => {
    try {
      setLoadingUsers(true);
      setErrorUsers(null);
      const data = await getAdminUsers({
        search: currentSearch.trim() || undefined,
        role: currentRole || undefined,
        page: targetPage,
        limit: 10,
      });
      setUsers(data.items);
      setTotalUsers(data.total);
      setHasMoreUsers(data.has_more);
      setUsersPage(targetPage);
    } catch (err) {
      setErrorUsers(errorMessage(err));
    } finally {
      setLoadingUsers(false);
    }
  }, [roleFilter, searchQuery]);

  useEffect(() => {
    setLoadingMetrics(true);
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    void loadUsers(1, roleFilter, searchQuery);
  }, [roleFilter]);

  useRealtimeSync({
    events: [
      "job.created",
      "job.closed",
      "job.taken_down",
      "application.submitted",
      "notification.created",
      "support.thread_created",
      "support.thread_resolved",
    ],
    onEvent: () => {
      void loadMetrics();
      void loadUsers(usersPage, roleFilter, searchQuery);
    },
  });

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    void loadUsers(1, roleFilter, searchQuery);
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

  const userColumns = [
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
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-neon animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-neon">
              Platform Administration
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-base-50">
            Admin Nerve Center
          </h1>
          <p className="text-sm text-base-400 mt-1">
            Real-time platform overview, user moderation, job oversight, and central support desk.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-2 rounded-lg border border-base-700 bg-base-800/80 px-4 py-2 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50 transition-colors"
          >
            Manage Users
          </Link>
          <Link
            to="/admin/jobs"
            className="inline-flex items-center gap-2 rounded-lg border border-base-700 bg-base-800/80 px-4 py-2 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50 transition-colors"
          >
            Jobs Oversight
          </Link>
          <Link
            to="/admin/support"
            className="inline-flex items-center gap-2 rounded-lg bg-neon px-4 py-2 text-xs font-semibold text-base-950 hover:bg-neon/90 shadow-[0_0_15px_rgba(0,240,255,0.25)] transition-all"
          >
            Support Center
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {errorMetrics && (
        <div
          role="alert"
          className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-4 text-sm text-rose-accent flex items-center justify-between"
        >
          <span>Failed to load platform metrics: {errorMetrics}</span>
          <button
            onClick={() => window.location.reload()}
            className="underline font-semibold hover:text-rose-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Candidates Metric */}
        <div className="relative overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/60 p-6 backdrop-blur-sm group hover:border-neon/40 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-base-400">
              Total Candidates
            </span>
            <span className="p-2 rounded-lg bg-base-800 text-neon">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-base-50">
            {loadingMetrics ? "..." : (metrics?.total_candidates ?? 0)}
          </div>
          <p className="mt-2 text-xs text-base-400">
            Registered job seekers with active resume profiles.
          </p>
        </div>

        {/* Recruiters Metric */}
        <div className="relative overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/60 p-6 backdrop-blur-sm group hover:border-emerald-accent/40 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-base-400">
              Total Recruiters
            </span>
            <span className="p-2 rounded-lg bg-base-800 text-emerald-accent">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-base-50">
            {loadingMetrics ? "..." : (metrics?.total_recruiters ?? 0)}
          </div>
          <p className="mt-2 text-xs text-base-400">
            Verified hiring managers and company talent teams.
          </p>
        </div>

        {/* Jobs Metric */}
        <div className="relative overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/60 p-6 backdrop-blur-sm group hover:border-amber-accent/40 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-base-400">
              Jobs Overview
            </span>
            <span className="p-2 rounded-lg bg-base-800 text-amber-accent">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold text-base-50">
              {loadingMetrics ? "..." : (metrics?.total_jobs ?? 0)}
            </span>
            {metrics && (
              <span className="text-xs font-medium text-emerald-accent">
                {metrics.open_jobs} Open / {metrics.closed_jobs} Closed
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-base-400">
            All posted opportunities platform-wide.
          </p>
        </div>

        {/* Applications Metric */}
        <div className="relative overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/60 p-6 backdrop-blur-sm group hover:border-neon/40 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-base-400">
              Total Applications
            </span>
            <span className="p-2 rounded-lg bg-base-800 text-neon">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-base-50">
            {loadingMetrics ? "..." : (metrics?.total_applications ?? 0)}
          </div>
          <p className="mt-2 text-xs text-base-400">
            Submissions processed through the matching pipeline.
          </p>
        </div>

        {/* Shortlists Metric */}
        <div className="relative overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/60 p-6 backdrop-blur-sm group hover:border-emerald-accent/40 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-base-400">
              Shortlisted Candidates
            </span>
            <span className="p-2 rounded-lg bg-base-800 text-emerald-accent">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <div className="font-display text-3xl font-bold text-emerald-accent">
            {loadingMetrics ? "..." : (metrics?.total_shortlisted ?? 0)}
          </div>
          <p className="mt-2 text-xs text-base-400">
            Candidates meeting or exceeding the auto-shortlist threshold.
          </p>
        </div>

        {/* Support Tickets Metric */}
        <div className="relative overflow-hidden rounded-2xl border border-base-700/60 bg-base-900/60 p-6 backdrop-blur-sm group hover:border-rose-accent/40 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-base-400">
              Support Inquiries
            </span>
            <span className="p-2 rounded-lg bg-base-800 text-rose-accent">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold text-rose-accent">
              {loadingMetrics ? "..." : (metrics?.open_support_tickets ?? 0)}
            </span>
            {metrics && (
              <span className="text-xs font-medium text-base-400">
                Open / {metrics.resolved_support_tickets} Resolved
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-base-400">
            Active queries from candidates and recruiters requiring attention.
          </p>
        </div>
      </div>

      {/* Quick Navigation Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        <Link
          to="/admin/users"
          className="rounded-2xl border border-base-800 bg-base-900/40 p-6 hover:border-neon/40 hover:bg-base-900/70 transition-all group"
        >
          <div className="h-10 w-10 rounded-xl bg-neon/10 border border-neon/20 flex items-center justify-center text-neon mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-base-100 text-base mb-1">User & Recruiter Directory</h3>
          <p className="text-xs text-base-400 leading-relaxed">
            Search, inspect user details, and toggle active/deactivated accounts across candidates and recruiters.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-neon group-hover:translate-x-1 transition-transform">
            View Directory &rarr;
          </div>
        </Link>

        <Link
          to="/admin/jobs"
          className="rounded-2xl border border-base-800 bg-base-900/40 p-6 hover:border-amber-accent/40 hover:bg-base-900/70 transition-all group"
        >
          <div className="h-10 w-10 rounded-xl bg-amber-accent/10 border border-amber-accent/20 flex items-center justify-center text-amber-accent mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="font-semibold text-base-100 text-base mb-1">Jobs & Submissions Oversight</h3>
          <p className="text-xs text-base-400 leading-relaxed">
            Audit all postings platform-wide, moderate inappropriate listings with take-down reasons, and view applications.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-amber-accent group-hover:translate-x-1 transition-transform">
            Audit Jobs &rarr;
          </div>
        </Link>

        <Link
          to="/admin/support"
          className="rounded-2xl border border-base-800 bg-base-900/40 p-6 hover:border-emerald-accent/40 hover:bg-base-900/70 transition-all group"
        >
          <div className="h-10 w-10 rounded-xl bg-emerald-accent/10 border border-emerald-accent/20 flex items-center justify-center text-emerald-accent mb-4 group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
          </div>
          <h3 className="font-semibold text-base-100 text-base mb-1">Central Support Desk</h3>
          <p className="text-xs text-base-400 leading-relaxed">
            Communicate with candidates and recruiters in live threads, answer technical queries, and resolve tickets.
          </p>
          <div className="mt-4 flex items-center text-xs font-semibold text-emerald-accent group-hover:translate-x-1 transition-transform">
            Open Helpdesk &rarr;
          </div>
        </Link>
      </div>

      {/* Embedded Candidate & Recruiter Management Section */}
      <div className="rounded-2xl border border-base-700/60 bg-base-900/40 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-neon">
                User Management Console
              </span>
              <span className="rounded-full bg-base-800 px-2 py-0.5 text-[11px] font-mono text-base-300">
                {totalUsers} Accounts
              </span>
            </div>
            <h2 className="font-display text-xl font-bold text-base-50 mt-1">
              Candidate & Recruiter Accounts
            </h2>
            <p className="text-xs text-base-400 mt-0.5">
              Review and moderate registered candidates and recruiters directly from the nerve center.
            </p>
          </div>

          <Link
            to="/admin/users"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neon hover:text-neon-dim transition-colors"
          >
            Open Full Directory &rarr;
          </Link>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-base-950 p-1 rounded-xl border border-base-800">
            <button
              onClick={() => setRoleFilter("")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                roleFilter === ""
                  ? "bg-neon/15 text-neon font-semibold"
                  : "text-base-400 hover:text-base-200"
              }`}
            >
              All Users ({totalUsers})
            </button>
            <button
              onClick={() => setRoleFilter("candidate")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                roleFilter === "candidate"
                  ? "bg-neon/15 text-neon font-semibold"
                  : "text-base-400 hover:text-base-200"
              }`}
            >
              Candidates ({metrics?.total_candidates ?? 0})
            </button>
            <button
              onClick={() => setRoleFilter("recruiter")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                roleFilter === "recruiter"
                  ? "bg-amber-accent/15 text-amber-accent font-semibold"
                  : "text-base-400 hover:text-base-200"
              }`}
            >
              Recruiters ({metrics?.total_recruiters ?? 0})
            </button>
          </div>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name or email..."
              className="rounded-lg border border-base-700 bg-base-950 px-3 py-1.5 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="rounded-lg bg-base-800 border border-base-700 px-3 py-1.5 text-xs font-semibold text-base-200 hover:border-base-600 hover:text-base-50 transition-colors"
            >
              Search
            </button>
          </form>
        </div>

        {errorUsers && (
          <div
            className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent"
          >
            {errorUsers}
          </div>
        )}

        {/* Embedded Data Table */}
        <DataTable
          columns={userColumns}
          data={users}
          keyExtractor={(item) => item.id}
          page={usersPage}
          onPageChange={(newPage) => void loadUsers(newPage, roleFilter, searchQuery)}
          hasMore={hasMoreUsers}
          emptyMessage={loadingUsers ? "Loading users..." : "No users found."}
        />
      </div>

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

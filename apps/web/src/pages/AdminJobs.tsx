import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getAdminJobs,
  getAdminApplications,
  takedownJob,
  errorMessage,
} from "../api/client";
import DataTable from "../components/DataTable";
import ScoreBadge from "../components/ScoreBadge";
import type { AdminJobItem, AdminApplicationItem } from "../types";

export default function AdminJobs() {
  const [activeTab, setActiveTab] = useState<"jobs" | "applications">("jobs");

  // Jobs state
  const [jobs, setJobs] = useState<AdminJobItem[]>([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsHasMore, setJobsHasMore] = useState(false);
  const [jobsSearch, setJobsSearch] = useState("");
  const [jobsStatusFilter, setJobsStatusFilter] = useState("");
  const [jobsLoading, setJobsLoading] = useState(true);

  // Applications state
  const [applications, setApplications] = useState<AdminApplicationItem[]>([]);
  const [appsTotal, setAppsTotal] = useState(0);
  const [appsPage, setAppsPage] = useState(1);
  const [appsHasMore, setAppsHasMore] = useState(false);
  const [appsSearch, setAppsSearch] = useState("");
  const [appsStatusFilter, setAppsStatusFilter] = useState("");
  const [appsLoading, setAppsLoading] = useState(false);

  // Takedown Modal State
  const [takedownTarget, setTakedownTarget] = useState<AdminJobItem | null>(null);
  const [takedownReason, setTakedownReason] = useState("");
  const [takedownBusy, setTakedownBusy] = useState(false);
  const [takedownError, setTakedownError] = useState<string | null>(null);

  const [generalError, setGeneralError] = useState<string | null>(null);

  async function loadJobs(targetPage = jobsPage) {
    const safePage = Math.max(1, targetPage);
    try {
      setJobsLoading(true);
      setGeneralError(null);
      const data = await getAdminJobs({
        search: jobsSearch.trim() || undefined,
        status: jobsStatusFilter || undefined,
        page: safePage,
        limit: 10,
      });
      setJobs(data?.items || []);
      setJobsTotal(data?.total || 0);
      setJobsHasMore(data?.has_more || false);
      setJobsPage(safePage);
    } catch (err) {
      setGeneralError(errorMessage(err));
    } finally {
      setJobsLoading(false);
    }
  }

  async function loadApplications(targetPage = appsPage) {
    const safePage = Math.max(1, targetPage);
    try {
      setAppsLoading(true);
      setGeneralError(null);
      const data = await getAdminApplications({
        search: appsSearch.trim() || undefined,
        status: appsStatusFilter || undefined,
        page: safePage,
        limit: 10,
      });
      setApplications(data?.items || []);
      setAppsTotal(data?.total || 0);
      setAppsHasMore(data?.has_more || false);
      setAppsPage(safePage);
    } catch (err) {
      setGeneralError(errorMessage(err));
    } finally {
      setAppsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "jobs") {
      loadJobs(1);
    } else {
      loadApplications(1);
    }
  }, [activeTab, jobsStatusFilter, appsStatusFilter]);

  async function handleConfirmTakedown(e: React.FormEvent) {
    e.preventDefault();
    if (!takedownTarget || !takedownReason.trim()) return;

    try {
      setTakedownBusy(true);
      setTakedownError(null);
      const updated = await takedownJob(takedownTarget.id, takedownReason.trim());
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      setTakedownTarget(null);
      setTakedownReason("");
    } catch (err) {
      setTakedownError(errorMessage(err));
    } finally {
      setTakedownBusy(false);
    }
  }

  // Jobs Columns
  const jobColumns = [
    {
      key: "title",
      header: "Opportunity",
      render: (item: AdminJobItem) => (
        <div>
          <div className="font-semibold text-base-100 flex items-center gap-2">
            {item.title}
            {item.is_taken_down && (
              <span className="rounded bg-rose-accent/20 border border-rose-accent/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-accent">
                Moderated / Taken Down
              </span>
            )}
          </div>
          <div className="text-xs text-base-400">{item.company}</div>
          {item.takedown_reason && (
            <div className="mt-1 text-[11px] text-rose-accent/80 italic">
              Reason: {item.takedown_reason}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "recruiter",
      header: "Recruiter / Owner",
      render: (item: AdminJobItem) => (
        <div className="text-xs">
          <div className="font-medium text-base-200">
            {item.recruiter_name || "Unknown Recruiter"}
          </div>
          <div className="font-mono text-base-500">{item.recruiter_email || "N/A"}</div>
        </div>
      ),
    },
    {
      key: "metrics",
      header: "Activity",
      render: (item: AdminJobItem) => (
        <div className="text-xs text-base-300">
          <span className="font-medium text-base-100">{item.applicant_count}</span> applicants
          <span className="text-emerald-accent block font-medium">
            {item.shortlisted_count} shortlisted
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: AdminJobItem) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            item.status === "open" && !item.is_taken_down
              ? "bg-emerald-accent/10 text-emerald-accent border border-emerald-accent/30"
              : "bg-base-800 text-base-400 border border-base-700"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              item.status === "open" && !item.is_taken_down
                ? "bg-emerald-accent"
                : "bg-base-500"
            }`}
          />
          {item.is_taken_down ? "Closed (Admin)" : (item.status || "open").toUpperCase()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Moderation",
      render: (item: AdminJobItem) => (
        <div>
          {item.is_taken_down ? (
            <span className="text-xs text-base-500 italic">No action needed</span>
          ) : (
            <button
              onClick={() => {
                setTakedownError(null);
                setTakedownReason("");
                setTakedownTarget(item);
              }}
              className="rounded-lg border border-rose-accent/40 bg-rose-accent/10 px-3 py-1 text-xs font-semibold text-rose-accent hover:bg-rose-accent/20 transition-colors"
            >
              Take Down
            </button>
          )}
        </div>
      ),
    },
  ];

  // Application Columns
  const applicationColumns = [
    {
      key: "candidate",
      header: "Candidate",
      render: (item: AdminApplicationItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.candidate_name}</div>
          <div className="font-mono text-xs text-base-400">{item.candidate_email}</div>
        </div>
      ),
    },
    {
      key: "job",
      header: "Target Job",
      render: (item: AdminApplicationItem) => (
        <div>
          <div className="font-semibold text-base-100">{item.job_title}</div>
          <div className="text-xs text-base-400">{item.job_company}</div>
        </div>
      ),
    },
    {
      key: "scores",
      header: "Trust-Weighted Scores",
      render: (item: AdminApplicationItem) => (
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[10px] text-base-400 uppercase tracking-wider block">Final</span>
            <ScoreBadge score={item.final_score ?? 0} />
          </div>
          <div>
            <span className="text-[10px] text-base-400 uppercase tracking-wider block">Trust</span>
            <span className="text-xs font-mono font-semibold text-base-200">
              {item.trust_score !== null && item.trust_score !== undefined
                ? `${Math.round(item.trust_score * 100)}%`
                : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-base-400 uppercase tracking-wider block">Semantic</span>
            <span className="text-xs font-mono text-base-400">
              {item.similarity_score !== null && item.similarity_score !== undefined
                ? `${Math.round(item.similarity_score * 100)}%`
                : "N/A"}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: AdminApplicationItem) => (
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
            item.status === "shortlisted"
              ? "bg-emerald-accent/15 text-emerald-accent border border-emerald-accent/30"
              : item.status === "rejected"
              ? "bg-rose-accent/15 text-rose-accent border border-rose-accent/30"
              : "bg-base-800 text-base-300 border border-base-700"
          }`}
        >
          {item.status}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Submitted",
      render: (item: AdminApplicationItem) => (
        <span className="text-xs text-base-400 font-mono">
          {item.created_at
            ? (() => {
                try {
                  const d = new Date(item.created_at);
                  return isNaN(d.getTime())
                    ? "N/A"
                    : d.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      });
                } catch {
                  return "N/A";
                }
              })()
            : "N/A"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-base-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/admin" className="text-xs font-mono text-neon hover:underline">
              &larr; Admin Nerve Center
            </Link>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-base-50">
            Jobs & Applications Oversight
          </h1>
          <p className="text-xs text-base-400 mt-1">
            Platform-wide audit of all open and closed opportunities and candidate applications.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-base-900 border border-base-700/60 p-1">
          <button
            onClick={() => setActiveTab("jobs")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "jobs"
                ? "bg-amber-accent/20 text-amber-accent border border-amber-accent/40 shadow-sm"
                : "text-base-400 hover:text-base-100"
            }`}
          >
            Jobs Directory ({jobsTotal})
          </button>
          <button
            onClick={() => setActiveTab("applications")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "applications"
                ? "bg-neon/20 text-neon border border-neon/40 shadow-sm"
                : "text-base-400 hover:text-base-100"
            }`}
          >
            All Applications ({appsTotal})
          </button>
        </div>
      </div>

      {generalError && (
        <div role="alert" className="rounded-xl border border-rose-accent/40 bg-rose-accent/10 p-4 text-xs text-rose-accent">
          {generalError}
        </div>
      )}

      {/* JOBS TAB */}
      {activeTab === "jobs" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-base-900/60 border border-base-800 p-4 rounded-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadJobs(1);
              }}
              className="flex-1 flex items-center gap-2"
            >
              <input
                type="text"
                value={jobsSearch}
                onChange={(e) => setJobsSearch(e.target.value)}
                placeholder="Search by job title or company..."
                className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
              />
              <button
                type="submit"
                className="rounded-lg bg-base-800 border border-base-700 px-4 py-2 text-xs font-semibold text-base-200 hover:text-base-50"
              >
                Search
              </button>
            </form>

            <select
              value={jobsStatusFilter}
              onChange={(e) => setJobsStatusFilter(e.target.value)}
              className="rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-xs text-base-200 focus:border-neon focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="open">Open Only</option>
              <option value="closed">Closed Only</option>
            </select>
          </div>

          <DataTable
            columns={jobColumns}
            data={jobs}
            keyExtractor={(item) => item.id}
            page={jobsPage}
            minPage={1}
            onPageChange={(p) => loadJobs(p)}
            hasMore={jobsHasMore}
            emptyMessage={jobsLoading ? "Loading platform jobs..." : "No jobs found."}
          />
        </div>
      )}

      {/* APPLICATIONS TAB */}
      {activeTab === "applications" && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-base-900/60 border border-base-800 p-4 rounded-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadApplications(1);
              }}
              className="flex-1 flex items-center gap-2"
            >
              <input
                type="text"
                value={appsSearch}
                onChange={(e) => setAppsSearch(e.target.value)}
                placeholder="Search by candidate name, email, job, or company..."
                className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-xs text-base-100 placeholder-base-500 focus:border-neon focus:outline-none transition-colors"
              />
              <button
                type="submit"
                className="rounded-lg bg-base-800 border border-base-700 px-4 py-2 text-xs font-semibold text-base-200 hover:text-base-50"
              >
                Search
              </button>
            </form>

            <select
              value={appsStatusFilter}
              onChange={(e) => setAppsStatusFilter(e.target.value)}
              className="rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-xs text-base-200 focus:border-neon focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <DataTable
            columns={applicationColumns}
            data={applications}
            keyExtractor={(item) => item.id}
            page={appsPage}
            minPage={1}
            onPageChange={(p) => loadApplications(p)}
            hasMore={appsHasMore}
            emptyMessage={appsLoading ? "Loading applications..." : "No applications found."}
          />
        </div>
      )}

      {/* Take Down Job Modal */}
      {takedownTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-950/80 backdrop-blur-md animate-fade-in"
          onClick={() => setTakedownTarget(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-rose-accent/40 bg-base-900 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-rose-accent">
                Content Moderation Action
              </p>
              <h3 className="font-display text-lg font-bold text-base-50 mt-1">
                Take Down Inappropriate Job Listing
              </h3>
              <p className="text-xs text-base-300 mt-1">
                Job: <strong className="text-base-100">{takedownTarget.title}</strong> at{" "}
                <strong className="text-base-100">{takedownTarget.company}</strong>
              </p>
            </div>

            <form onSubmit={handleConfirmTakedown} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-base-300 mb-1.5">
                  Takedown Reason <span className="text-rose-accent">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={takedownReason}
                  onChange={(e) => setTakedownReason(e.target.value)}
                  placeholder="Explain why this posting is being removed (e.g. fraudulent, spam, policy violation)..."
                  className="w-full rounded-lg border border-base-700 bg-base-950 px-3.5 py-2 text-xs text-base-100 placeholder-base-500 focus:border-rose-accent focus:outline-none transition-colors resize-none"
                />
              </div>

              {takedownError && (
                <div className="rounded-lg border border-rose-accent/40 bg-rose-accent/10 p-3 text-xs text-rose-accent">
                  {takedownError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTakedownTarget(null)}
                  disabled={takedownBusy}
                  className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-300 hover:text-base-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={takedownBusy || !takedownReason.trim()}
                  className="rounded-lg bg-rose-accent px-5 py-2 text-xs font-semibold text-base-950 hover:bg-rose-accent/90 transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] disabled:opacity-50"
                >
                  {takedownBusy ? "Taking Down..." : "Confirm Takedown"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

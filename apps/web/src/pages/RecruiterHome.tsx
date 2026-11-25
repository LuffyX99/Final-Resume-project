import { useState } from "react";
import { Link } from "react-router-dom";
import { closeJob, errorMessage, getMyJobs } from "../api/client";
import DataTable from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { useLiveResource } from "../hooks/useLiveResource";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import type { Job } from "../types";

const PAGE_SIZE = 10;

const FILTERS = [
  { label: "All", value: undefined },
  { label: "Open", value: "open" },
  { label: "Closed", value: "closed" },
] as const;

export default function RecruiterHome() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [confirmingJobId, setConfirmingJobId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const key = `recruiter:jobs:${page}:${statusFilter ?? "all"}`;
  const {
    data: jobs,
    loading,
    refreshing,
    error,
    refresh,
  } = useLiveResource(key, () =>
    getMyJobs(page * PAGE_SIZE, PAGE_SIZE, statusFilter),
  );

  useRealtimeSync({
    events: [
      "job.created",
      "job.updated",
      "job.closed",
      "job.taken_down",
      "application.submitted",
      "application.shortlist_overridden",
    ],
    onEvent: () => {
      void refresh();
    },
  });

  async function handleClose(jobId: string) {
    setBusyJobId(jobId);
    setConfirmingJobId(null);
    setActionError(null);
    try {
      await closeJob(jobId);
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyJobId(null);
    }
  }

  function handleFilter(val: string | undefined) {
    setStatusFilter(val);
    setPage(0);
  }

  if (loading && !jobs) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in py-12">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading your jobs...
      </div>
    );
  }

  if (error && !jobs) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="font-display text-xl font-semibold text-base-50">
            Could not load your jobs
          </p>
          <p className="mt-2 text-sm text-rose-accent">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const list = jobs ?? [];
  const isInitialEmpty = list.length === 0 && page === 0 && statusFilter === undefined;

  return (
    <div className="animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-base-50 sm:text-4xl">
            Recruiter Dashboard
          </h1>
          <p className="mt-1 text-base-300">
            Manage your postings and review incoming applicants
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-base-600 bg-base-800 px-4 py-2.5 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992V4.356m0 4.992l-3.181-3.182a8.25 8.25 0 10-2.332 8.163"
              />
            </svg>
            Refresh
          </button>
          {!isInitialEmpty && (
            <Link
              to="/jobs/new"
              className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              Post a job
            </Link>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent"
        >
          {actionError}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => handleFilter(f.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-neon/15 border border-neon/30 text-neon"
                  : "border border-base-600 bg-base-800 text-base-300 hover:bg-base-700 hover:text-base-100"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isInitialEmpty ? (
        <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-base-700">
            <svg
              className="h-6 w-6 text-base-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </div>
          <p className="font-display text-lg font-semibold text-base-50">
            No jobs yet. Post your first role to start matching applicants.
          </p>
          <p className="mt-1 max-w-md text-sm text-base-400">
            Create job postings with required skills to rank resumes with semantic similarity and trust scoring.
          </p>
          <Link
            to="/jobs/new"
            className="mt-6 rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim shadow-[0_0_15px_rgba(0,240,255,0.15)] transition-all duration-200"
          >
            Post a job
          </Link>
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: "title",
              header: "Role / Company",
              render: (job: Job) => (
                <div>
                  <Link
                    to={`/jobs/${job.id}`}
                    className="font-semibold text-base-50 hover:text-neon transition-colors duration-200"
                  >
                    {job.title}
                  </Link>
                  <p className="text-xs text-base-300 mt-0.5">{job.company}</p>
                </div>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (job: Job) => <StatusBadge status={job.status} />,
            },
            {
              key: "applicant_count",
              header: "Applicants",
              render: (job: Job) => (
                <span className="font-mono text-sm text-base-200">
                  {job.applicant_count}
                </span>
              ),
            },
            {
              key: "shortlisted_count",
              header: "Shortlisted",
              render: (job: Job) => (
                <span className="font-mono text-sm text-base-200">
                  {job.shortlisted_count}
                </span>
              ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (job: Job) => (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/jobs/${job.id}/edit`}
                    className="rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-xs font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
                  >
                    Edit
                  </Link>
                  <Link
                    to={`/jobs/${job.id}/applicants`}
                    className="rounded-lg border border-neon/30 bg-neon/10 px-3 py-1.5 text-xs font-medium text-neon hover:bg-neon/20 transition-all duration-200"
                  >
                    Applicants
                  </Link>
                  {confirmingJobId === job.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleClose(job.id)}
                        disabled={busyJobId === job.id}
                        className="rounded-lg bg-rose-accent px-2.5 py-1.5 text-xs font-semibold text-base-950 hover:bg-rose-accent/90 transition-all duration-200 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingJobId(null)}
                        disabled={busyJobId === job.id}
                        className="rounded-lg border border-base-600 bg-base-800 px-2.5 py-1.5 text-xs font-medium text-base-300 hover:bg-base-700 transition-all duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingJobId(job.id)}
                      disabled={job.status === "closed" || busyJobId === job.id}
                      className="rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-xs font-medium text-base-200 hover:bg-base-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      Close
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          data={list}
          keyExtractor={(j) => j.id}
          page={page}
          onPageChange={setPage}
          hasMore={list.length === PAGE_SIZE}
          emptyMessage="No jobs found."
        />
      )}
    </div>
  );
}

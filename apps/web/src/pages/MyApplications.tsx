import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getMyApplications } from "../api/client";
import ApplicationStatusBadge from "../components/ApplicationStatusBadge";
import DataTable from "../components/DataTable";
import ScoreBadge from "../components/ScoreBadge";
import SkillGapModal from "../components/SkillGapModal";
import { useLiveResource } from "../hooks/useLiveResource";
import { deriveMatchInsight } from "../lib/matchInsight";
import type { JobApplication } from "../types";

export default function MyApplications() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [selectedApplication, setSelectedApplication] =
    useState<JobApplication | null>(null);

  const { data, loading, refreshing, error, refresh } = useLiveResource(
    "my-applications",
    () => getMyApplications(),
  );

  const applications = data ?? [];
  const shortlisted = applications.filter(
    (application) => application.status === "shortlisted",
  ).length;

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading your applications...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="font-display text-xl font-semibold text-base-50">
            Could not load your applications
          </p>
          <p className="mt-2 text-sm text-rose-accent">{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-5 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-neon/70">
            Candidate workspace
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-base-50">
            My Applications
          </h1>
          <p className="mt-2 max-w-2xl text-base-300">
            Every role you have applied to, with its live status and match
            scores.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992V4.356m0 4.992l-3.181-3.182a8.25 8.25 0 10-2.332 8.163"
              />
            </svg>
            Refresh
          </button>
          <Link
            to="/candidate"
            className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
          >
            Browse open roles
          </Link>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 p-4 text-sm text-emerald-accent"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
          {notice}
        </div>
      )}

      {error && data && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-accent/30 bg-amber-accent/10 p-4 text-sm text-amber-200"
        >
          <span>Could not refresh your applications: {error}</span>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border border-amber-accent/30 px-3 py-1.5 text-xs font-semibold text-amber-accent hover:bg-amber-accent/10 transition-colors duration-200"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-base-400">
          {applications.length} application
          {applications.length !== 1 && "s"} · {shortlisted} shortlisted
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-base-400">
          {refreshing ? "Refreshing from API..." : "Live status and scores"}
        </p>
      </div>

      <DataTable
        columns={[
          {
            key: "job",
            header: "Role",
            cellClassName: "whitespace-normal min-w-[220px]",
            render: (application: JobApplication) => (
              <div>
                <Link
                  to={`/jobs/${application.job.id}`}
                  className="font-medium text-neon hover:text-neon-dim transition-colors duration-200"
                >
                  {application.job.title}
                </Link>
                <p className="mt-0.5 text-xs text-base-400">
                  {application.job.company}
                </p>
              </div>
            ),
          },
          {
            key: "applied",
            header: "Applied",
            render: (application) => (
              <span className="font-mono text-xs text-base-300">
                {new Date(application.created_at).toLocaleDateString()}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (application) => (
              <ApplicationStatusBadge status={application.status} />
            ),
          },
          {
            key: "final",
            header: "Final Score",
            render: (application) => {
              if (!application.match) {
                return (
                  <span className="font-mono text-xs text-base-400">
                    Pending
                  </span>
                );
              }
              const insight = deriveMatchInsight(
                application.match,
                application.job,
              );
              return <ScoreBadge score={insight.finalScore} />;
            },
          },
          {
            key: "readiness",
            header: "Readiness",
            render: (application) => {
              const insight = application.match
                ? deriveMatchInsight(application.match, application.job)
                : null;
              const readiness =
                application.readiness_score ?? insight?.readinessScore ?? null;
              if (readiness === null || readiness === undefined) {
                return <span className="text-xs text-base-400">—</span>;
              }
              const colorClass =
                readiness >= 75
                  ? "text-emerald-accent"
                  : readiness >= 50
                  ? "text-neon"
                  : "text-amber-accent";
              return (
                <span className={`font-mono text-sm font-semibold ${colorClass}`}>
                  {readiness}%
                </span>
              );
            },
          },
          {
            key: "similarity",
            header: "Similarity",
            render: (application) => {
              if (!application.match) {
                return <span className="text-xs text-base-400">—</span>;
              }
              const insight = deriveMatchInsight(
                application.match,
                application.job,
              );
              return (
                <span className="font-mono text-sm text-base-100">
                  {Math.round(insight.similarityScore * 100)}%
                </span>
              );
            },
          },
          {
            key: "trust",
            header: "Trust",
            render: (application) => {
              if (!application.match) {
                return <span className="text-xs text-base-400">—</span>;
              }
              const insight = deriveMatchInsight(
                application.match,
                application.job,
              );
              return (
                <span className="font-mono text-sm text-base-100">
                  {Math.round(insight.trustScore * 100)}%
                </span>
              );
            },
          },
          {
            key: "resume",
            header: "Resume",
            render: (application) => (
              <span
                className="font-mono text-xs text-base-300"
                title={application.resume.file_name ?? undefined}
              >
                {application.resume.file_name ?? "Uploaded resume"}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Action",
            cellClassName: "whitespace-nowrap",
            render: (application) => (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedApplication(application)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-neon hover:text-neon-dim transition-colors duration-200"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Skill Gap
                </button>
                <Link
                  to={`/jobs/${application.job.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-base-200 hover:text-base-50 transition-colors duration-200"
                >
                  View role
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </div>
            ),
          },
        ]}
        data={applications}
        keyExtractor={(application) => application.id}
        page={0}
        onPageChange={() => {}}
        hasMore={false}
        showPagination={false}
        rowClassName={(application) =>
          application.status === "shortlisted" ? "bg-emerald-accent/5" : ""
        }
        emptyMessage="No applications yet. Browse open roles to apply."
      />

      {selectedApplication && (
        <SkillGapModal
          application={selectedApplication}
          onClose={() => setSelectedApplication(null)}
        />
      )}
    </div>
  );
}

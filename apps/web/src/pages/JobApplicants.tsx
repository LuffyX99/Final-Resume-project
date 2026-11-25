import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  computeMatches,
  errorMessage,
  getJob,
  getJobMatches,
  updateMatch,
} from "../api/client";
import DataTable from "../components/DataTable";
import ScoreBadge from "../components/ScoreBadge";
import ScoreMeter from "../components/ScoreMeter";
import SkillAlignment from "../components/SkillAlignment";
import StatusBadge from "../components/StatusBadge";
import { useLiveResource } from "../hooks/useLiveResource";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import {
  rankApplicants,
  type RankedApplicant,
} from "../lib/matchInsight";
import type { Match } from "../types";

type ApplicantRow = RankedApplicant & { rank: number };

export default function JobApplicants() {
  const { id } = useParams<{ id: string }>();
  const [busyMatchId, setBusyMatchId] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = useLiveResource(`applicants:${id ?? "missing"}`, async () => {
    if (!id) throw new Error("Job id is missing.");
    const [job, matches] = await Promise.all([
      getJob(id),
      getJobMatches(id, 100),
    ]);
    return { job, matches };
  });

  useRealtimeSync({
    events: ["application.submitted", "scores.ready", "application.shortlist_overridden"],
    onEvent: () => {
      void refresh();
    },
  });

  const ranked = useMemo<ApplicantRow[]>(() => {
    if (!data) return [];
    return rankApplicants(data.matches, data.job).map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [data]);

  async function handleToggleShortlist(match: Match) {
    setBusyMatchId(match.id);
    setActionError(null);
    try {
      await updateMatch(match.id, { shortlisted: !match.shortlisted });
      // Re-read the list and job counts from the API; no optimistic patching.
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyMatchId(null);
    }
  }

  async function handleCompute() {
    if (!id) return;
    setComputing(true);
    setActionError(null);
    try {
      await computeMatches({ job_id: id });
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setComputing(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading applicants...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="font-display text-xl font-semibold text-base-50">
            Could not load applicants
          </p>
          <p className="mt-2 text-sm text-rose-accent">{error}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => void refresh()}
              className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
            >
              Retry
            </button>
            <Link
              to="/recruiter"
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { job, matches } = data;
  const hasMatches = matches.length > 0;

  return (
    <div className="animate-fade-in">
      <Link
        to="/recruiter"
        className="inline-flex items-center gap-1.5 text-sm text-base-300 hover:text-neon transition-colors duration-200"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-neon/70">
            Applicants
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-base-50 sm:text-4xl">
              {job.title}
            </h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-2 text-lg text-base-200">{job.company}</p>
          <p className="mt-1 font-mono text-xs text-base-400">
            {job.applicant_count} applicant
            {job.applicant_count !== 1 && "s"} · {job.shortlisted_count}{" "}
            shortlisted
          </p>
          {job.status === "closed" && (
            <p className="mt-3 text-xs text-base-400">
              This role is closed to new applications. Existing applicants can
              still be reviewed and shortlisted.
            </p>
          )}
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
            to={`/jobs/${job.id}/edit`}
            className="rounded-lg border border-base-600 bg-base-800 px-4 py-2.5 text-sm font-medium text-base-100 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
          >
            Edit job
          </Link>
          <Link
            to={`/jobs/${job.id}`}
            className="rounded-lg border border-base-600 bg-base-800 px-4 py-2.5 text-sm font-medium text-base-100 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
          >
            View posting
          </Link>
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-base-400">
        Final Score = Semantic Similarity × Skill Trust. Trust is evaluated via anti-cheating inspection and required skill evidence; when a job lists no skills, it mirrors similarity.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-accent/30 bg-amber-accent/10 p-4 text-sm text-amber-200"
        >
          <span>Could not refresh the latest applicants: {error}</span>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border border-amber-accent/30 px-3 py-1.5 text-xs font-semibold text-amber-accent hover:bg-amber-accent/10 transition-colors duration-200"
          >
            Try again
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent"
        >
          {actionError}
        </div>
      )}

      {!hasMatches && (
        <div className="glass-card mt-6 flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-lg font-semibold text-base-50">
              No ranked applicants yet
            </p>
            <p className="mt-1 max-w-xl text-sm text-base-300">
              Compute matches to rank resumes against this role. The ranking is
              fetched from the API immediately afterwards.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCompute()}
            disabled={computing}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
          >
            {computing ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-base-950/30 border-t-base-950 animate-spin" />
                Computing...
              </>
            ) : (
              "Find matches"
            )}
          </button>
        </div>
      )}

      <div className="mb-4 mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-base-50">
          Ranked applicants
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-base-400">
          {ranked.length} candidate{ranked.length !== 1 && "s"} · sorted by final
          score
        </p>
      </div>

      <DataTable
        columns={[
          {
            key: "rank",
            header: "#",
            render: (row) => (
              <span className="font-mono text-xs text-base-400">
                {String(row.rank).padStart(2, "0")}
              </span>
            ),
          },
          {
            key: "candidate",
            header: "Candidate",
            cellClassName: "whitespace-nowrap min-w-[190px]",
            render: (row) => (
              <div>
                <Link
                  to={`/jobs/${job.id}/applicants/${row.match.id}`}
                  className="font-medium text-neon hover:text-neon-dim transition-colors duration-200"
                >
                  {row.match.candidate_name ?? "Unknown candidate"}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-400">
                  <span className="font-mono">
                    Applied{" "}
                    {new Date(row.match.created_at).toLocaleDateString()}
                  </span>
                  {row.match.bias_reduced && (
                    <span className="rounded-full border border-violet-accent/20 bg-violet-accent/10 px-2 py-0.5 text-[10px] font-medium text-violet-accent">
                      Bias-reduced
                    </span>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: "final",
            header: "Final Score",
            render: (row) => (
              <div className="flex flex-col items-start gap-1">
                <ScoreBadge score={row.insight.finalScore} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-base-400">
                  final
                </span>
              </div>
            ),
          },
          {
            key: "similarity",
            header: "Similarity",
            render: (row) => (
              <ScoreMeter score={row.insight.similarityScore} label="Similarity" />
            ),
          },
          {
            key: "trust",
            header: "Trust",
            render: (row) => (
              <ScoreMeter score={row.insight.trustScore} label="Skill trust" />
            ),
          },
          {
            key: "readiness",
            header: "Readiness",
            render: (row) => (
              <div className="flex flex-col items-start gap-1">
                <span className="font-mono text-sm font-semibold text-neon">
                  {row.insight.readinessScore}%
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-base-400">
                  readiness
                </span>
              </div>
            ),
          },
          {
            key: "skills",
            header: "Matched / Missing Skills",
            cellClassName: "whitespace-normal min-w-[260px] max-w-[360px]",
            render: (row) => (
              <SkillAlignment
                compact
                requiredSkills={row.insight.requiredSkills}
                matchedSkills={row.insight.matchedSkills}
                missingSkills={row.insight.missingSkills}
                staleSkills={row.insight.staleSkills}
              />
            ),
          },
          {
            key: "shortlisted",
            header: "Shortlisted",
            render: (row) => {
              const busy = busyMatchId === row.match.id;
              const disabled = busyMatchId !== null;
              return (
                <button
                  type="button"
                  onClick={() => void handleToggleShortlist(row.match)}
                  disabled={disabled}
                  aria-pressed={row.match.shortlisted}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                    row.match.shortlisted
                      ? "border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/15"
                      : "border-base-600 bg-base-800 text-base-200 hover:border-base-500 hover:bg-base-700"
                  }`}
                >
                  {busy
                    ? "Saving..."
                    : row.match.shortlisted
                      ? "Shortlisted"
                      : "Shortlist"}
                </button>
              );
            },
          },
          {
            key: "actions",
            header: "Application",
            render: (row) => (
              <Link
                to={`/jobs/${job.id}/applicants/${row.match.id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-base-200 hover:text-neon transition-colors duration-200"
              >
                Open
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
            ),
          },
        ]}
        data={ranked}
        keyExtractor={(row) => row.match.id}
        page={0}
        onPageChange={() => {}}
        hasMore={false}
        showPagination={false}
        rowClassName={(row) =>
          row.match.shortlisted ? "bg-emerald-accent/5" : ""
        }
        emptyMessage="No applicants yet. Compute matches to rank candidates."
      />
    </div>
  );
}

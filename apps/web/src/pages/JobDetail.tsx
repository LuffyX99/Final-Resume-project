import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  computeMatches,
  errorMessage,
  getJob,
  getJobMatches,
  getMyApplications,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import ApplicationStatusBadge from "../components/ApplicationStatusBadge";
import MatchCard from "../components/MatchCard";
import ScoreBadge from "../components/ScoreBadge";
import StatusBadge from "../components/StatusBadge";
import { useLiveResource } from "../hooks/useLiveResource";
import { deriveMatchInsight } from "../lib/matchInsight";

function label(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [computing, setComputing] = useState(false);
  const [biasReduced, setBiasReduced] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isRecruiter = user?.role === "recruiter" || user?.role === "admin";

  const { data, loading, error, refresh } = useLiveResource(
    `job:${id ?? "missing"}:${isRecruiter ? "staff" : "candidate"}`,
    async () => {
      if (!id) throw new Error("Job id is missing.");
      const job = await getJob(id);
      if (isRecruiter) {
        return { job, matches: await getJobMatches(id), application: null };
      }
      const applications = await getMyApplications(id);
      return { job, matches: [], application: applications[0] ?? null };
    },
  );

  async function handleCompute() {
    if (!id) return;
    setComputing(true);
    setActionError(null);
    try {
      await computeMatches({ job_id: id, bias_reduced: biasReduced });
      // Re-read the persisted ranking from the API.
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
        Loading job...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="text-rose-accent">{error}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => void refresh()}
              className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200"
            >
              Retry
            </button>
            <Link
              to={isRecruiter ? "/recruiter" : "/candidate"}
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
            >
              {isRecruiter ? "Back to dashboard" : "Back to roles"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { job, matches, application } = data;
  const meta = [
    job.location,
    label(job.job_type),
    label(job.experience),
  ].filter((value): value is string => Boolean(value));
  const applicationInsight =
    application?.match != null
      ? deriveMatchInsight(application.match, job)
      : null;
  const visibleMatches = matches.filter(
    (match) => match.similarity_score >= 0.5,
  );

  return (
    <div className="animate-fade-in">
      <Link
        to={isRecruiter ? "/recruiter" : "/candidate"}
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
        {isRecruiter ? "Back to dashboard" : "Back to open roles"}
      </Link>

      <div className="mt-6 glass-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight text-base-50">
                {job.title}
              </h1>
              <StatusBadge status={job.status} />
            </div>
            <p className="mt-2 text-lg text-base-200">{job.company}</p>
            {meta.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {meta.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-base-600 bg-base-800/80 px-2.5 py-1 text-[11px] text-base-300"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-sm text-base-400 font-mono">
              Posted {new Date(job.created_at).toLocaleDateString()}
            </p>
          </div>

          {isRecruiter ? (
            <Link
              to={`/jobs/${job.id}/applicants`}
              className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              View ranked applicants
            </Link>
          ) : application ? (
            <div className="rounded-xl border border-base-600/60 bg-base-800/50 p-4 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-base-400">
                Your application
              </p>
              <div className="mt-2 flex items-center justify-end gap-2">
                <ApplicationStatusBadge status={application.status} />
                {applicationInsight && (
                  <ScoreBadge score={applicationInsight.finalScore} />
                )}
              </div>
              <Link
                to="/applications"
                className="mt-2 inline-flex text-xs font-medium text-neon hover:text-neon-dim transition-colors duration-200"
              >
                View My Applications
              </Link>
            </div>
          ) : job.status === "open" ? (
            <Link
              to={`/jobs/${job.id}/apply`}
              className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 shadow-[0_0_15px_rgba(0,240,255,0.15)]"
            >
              Apply
            </Link>
          ) : (
            <span className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm text-base-400">
              Applications closed
            </span>
          )}
        </div>

        {job.skills && job.skills.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {job.skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center rounded-full border border-neon/20 bg-neon/10 px-3 py-1 text-xs font-medium text-neon"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-base-200">
          {job.description}
        </div>

        {!isRecruiter && !application && job.status === "open" && (
          <div className="mt-6 rounded-xl border border-neon/15 bg-neon/5 p-4 text-sm text-base-300">
            Ready to apply? You&apos;ll confirm your details, upload a PDF or
            DOCX resume, and get a match score in My Applications.
          </div>
        )}
      </div>

      {isRecruiter && (
        <div className="mt-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-xl font-bold text-base-50">
              Matching Candidates
            </h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-base-300 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={biasReduced}
                  onChange={(e) => setBiasReduced(e.target.checked)}
                  className="h-4 w-4 rounded border-base-500 bg-base-700 text-neon focus:ring-neon/30 focus:ring-offset-0"
                />
                <span className="group-hover:text-base-200 transition-colors">
                  Bias-reduced
                </span>
              </label>
              <button
                onClick={() => void handleCompute()}
                disabled={computing}
                className="rounded-lg bg-neon px-5 py-2.5 text-sm font-semibold text-base-950 hover:bg-neon-dim transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(0,240,255,0.15)]"
              >
                {computing ? (
                  <span className="flex items-center gap-2">
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-base-950/30 border-t-base-950 animate-spin" />
                    Computing...
                  </span>
                ) : (
                  "Find Matches"
                )}
              </button>
            </div>
          </div>

          {actionError && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent"
            >
              {actionError}
            </div>
          )}

          {matches.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-12 text-center">
              <p className="text-base-300">No matches yet.</p>
              <p className="mt-1 text-sm text-base-400">
                Click &ldquo;Find Matches&rdquo; to compute.
              </p>
            </div>
          ) : visibleMatches.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center py-12 text-center">
              <p className="text-base-300">No matches above 50% found.</p>
            </div>
          ) : (
            <div className="space-y-3 stagger-children">
              {visibleMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  mode="job"
                  to={`/jobs/${job.id}/applicants/${match.id}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

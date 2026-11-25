import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { errorMessage, getJobApplication, updateMatch } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import InterviewInviteModal from "../components/InterviewInviteModal";
import MatchCard from "../components/MatchCard";
import ScoreBadge from "../components/ScoreBadge";
import ScoreMeter from "../components/ScoreMeter";
import SkillAlignment from "../components/SkillAlignment";
import StatusBadge from "../components/StatusBadge";
import { useLiveResource } from "../hooks/useLiveResource";
import {
  deriveMatchInsight,
  SIMILARITY_WEIGHT,
  TRUST_WEIGHT,
} from "../lib/matchInsight";

export default function ApplicationDetail() {
  const { jobId, matchId } = useParams<{ jobId: string; matchId: string }>();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = useLiveResource(
    `application:${jobId ?? "missing"}:${matchId ?? "missing"}`,
    async () => {
      if (!jobId || !matchId) {
        throw new Error("Application link is incomplete.");
      }
      return getJobApplication(jobId, matchId);
    },
  );

  async function handleToggleShortlist() {
    if (!data) return;
    setBusy(true);
    setActionError(null);
    try {
      await updateMatch(data.match.id, {
        shortlisted: !data.match.shortlisted,
      });
      // Refresh so the badge, job counts, and status all come from the API.
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-base-300 animate-fade-in">
        <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
        Loading application...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in">
        <div className="glass-card p-8 text-center">
          <p className="font-display text-xl font-semibold text-base-50">
            Could not open this application
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
              to={jobId ? `/jobs/${jobId}/applicants` : "/recruiter"}
              className="rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200"
            >
              Back to applicants
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { job, match, resume } = data;
  const insight = deriveMatchInsight(match, job);
  const candidateName = match.candidate_name ?? "Candidate";

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/jobs/${job.id}/applicants`}
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
          Back to applicants
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-base-600 bg-base-800 px-4 py-2 text-sm font-medium text-base-200 hover:bg-base-700 hover:border-base-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
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
          {match.shortlisted && (
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-accent/40 bg-emerald-accent/15 px-4 py-2 text-sm font-semibold text-emerald-accent hover:bg-emerald-accent/25 transition-all shadow-[0_0_12px_rgba(52,211,153,0.15)]"
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
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
              Invite to Interview
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleToggleShortlist()}
            disabled={busy}
            aria-pressed={match.shortlisted}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
              match.shortlisted
                ? "border border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent hover:bg-emerald-accent/15"
                : "border border-base-600 bg-base-800 text-base-100 hover:bg-base-700 hover:border-base-500"
            }`}
          >
            {busy
              ? "Saving..."
              : match.shortlisted
                ? "Shortlisted"
                : "Shortlist candidate"}
          </button>
        </div>
      </div>

      {inviteNotice && (
        <div
          role="status"
          className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 p-4 text-sm text-emerald-accent"
        >
          <span>{inviteNotice}</span>
          <button
            onClick={() => setInviteNotice(null)}
            className="text-xs text-emerald-accent hover:underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-neon/70">
          Application
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-base-50 sm:text-4xl">
            {candidateName}
          </h1>
          <StatusBadge status={job.status} />
          {match.shortlisted && (
            <span className="rounded-full border border-emerald-accent/30 bg-emerald-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-accent">
              Shortlisted
            </span>
          )}
        </div>
        <p className="mt-2 text-lg text-base-200">
          Applied for{" "}
          <Link
            to={`/jobs/${job.id}/applicants`}
            className="text-neon hover:text-neon-dim transition-colors duration-200"
          >
            {job.title}
          </Link>{" "}
          at {job.company}
        </p>
        <p className="mt-1 font-mono text-xs text-base-400">
          {job.applicant_count} applicant
          {job.applicant_count !== 1 && "s"} · {job.shortlisted_count}{" "}
          shortlisted
        </p>
        {job.status === "closed" && (
          <p className="mt-2 text-xs text-base-400">
            This role is closed to new applications.
          </p>
        )}
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-accent/30 bg-rose-accent/10 p-4 text-sm text-rose-accent"
        >
          {actionError}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-accent/30 bg-amber-accent/10 p-4 text-sm text-amber-200"
        >
          <span>Could not refresh this application: {error}</span>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border border-amber-accent/30 px-3 py-1.5 text-xs font-semibold text-amber-accent hover:bg-amber-accent/10 transition-colors duration-200"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="glass-card p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-base-50">
              Resume
            </h2>
            <p className="font-mono text-xs text-base-400">
              Submitted {new Date(resume.created_at).toLocaleDateString()}
              {resume.file_name && (
                <span className="ml-2 text-base-300">
                  · {resume.file_name}
                </span>
              )}
            </p>
          </div>

          {resume.skills && resume.skills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {resume.skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center rounded-full border border-neon/20 bg-neon/10 px-3 py-1 text-xs font-medium text-neon"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          <div className="mt-6 whitespace-pre-wrap border-t border-base-600/50 pt-6 text-sm leading-relaxed text-base-200">
            {resume.content}
          </div>
        </div>

        <aside className="space-y-5">
          <MatchCard
            match={match}
            mode="job"
            to={null}
            score={insight.finalScore}
            subtitle={`${job.title} · ${job.company}`}
          />

          <div className="glass-card p-6">
            <h2 className="font-display text-lg font-bold text-base-50">
              Score breakdown
            </h2>

            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-base-300">Final score</span>
                <ScoreBadge score={insight.finalScore} />
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-base-300">Similarity</span>
                  <span className="font-mono text-sm text-base-100">
                    {Math.round(insight.similarityScore * 100)}%
                  </span>
                </div>
                <div className="mt-2">
                  <ScoreMeter
                    score={insight.similarityScore}
                    label="Semantic similarity"
                    showValue={false}
                    fullWidth
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-base-300">Trust</span>
                  <span className="font-mono text-sm text-base-100">
                    {Math.round(insight.trustScore * 100)}%
                  </span>
                </div>
                <div className="mt-2">
                  <ScoreMeter
                    score={insight.trustScore}
                    label="Skill trust"
                    showValue={false}
                    fullWidth
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-base-300">Readiness</span>
                  <span className="font-mono text-sm font-semibold text-neon">
                    {insight.readinessScore}%
                  </span>
                </div>
                <div className="mt-2">
                  <ScoreMeter
                    score={insight.readinessScore / 100}
                    label="Skill readiness"
                    showValue={false}
                    fullWidth
                  />
                </div>
              </div>
            </div>

            <p className="mt-5 border-t border-base-600/50 pt-4 text-xs leading-relaxed text-base-400">
              Final = {Math.round(SIMILARITY_WEIGHT * 100)}% similarity +{" "}
              {Math.round(TRUST_WEIGHT * 100)}% trust. Trust tracks how much of
              the job&apos;s required skill set appears in this profile.
            </p>
          </div>

          <div className="glass-card p-6">
            <h2 className="font-display text-lg font-bold text-base-50">
              Skill alignment
            </h2>
            <div className="mt-4">
              <SkillAlignment
                requiredSkills={insight.requiredSkills}
                matchedSkills={insight.matchedSkills}
                missingSkills={insight.missingSkills}
                staleSkills={insight.staleSkills}
              />
            </div>
          </div>

          {insight.learningSteps.length > 0 && (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold text-base-50">
                  Learning Recommendations
                </h2>
                <span className="rounded-full border border-neon/20 bg-neon/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neon">
                  {insight.learningSteps.length} action
                  {insight.learningSteps.length !== 1 && "s"}
                </span>
              </div>
              <p className="mt-1 text-xs text-base-400">
                Actionable steps to bridge missing or stale skill requirements.
              </p>
              <div className="mt-4 space-y-3">
                {insight.learningSteps.map((step) => (
                  <div
                    key={step.skill}
                    className="rounded-xl border border-base-700 bg-base-900/60 p-4 transition-all hover:border-base-600"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-base-100">
                        {step.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          step.status === "stale"
                            ? "border border-amber-accent/30 bg-amber-accent/10 text-amber-accent"
                            : "border border-rose-accent/30 bg-rose-accent/10 text-rose-accent"
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-base-300">
                      {step.action}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-base-400">
                      <span>{step.resource_hint}</span>
                      {step.estimated_time && (
                        <span className="font-mono text-neon/80">
                          {step.estimated_time}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card p-6">
            <h2 className="font-display text-lg font-bold text-base-50">
              Application details
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-base-300">Submitted</dt>
                <dd className="font-mono text-xs text-base-100">
                  {new Date(resume.created_at).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-base-300">Match mode</dt>
                <dd className="text-xs text-base-100">
                  {match.bias_reduced ? "Bias-reduced" : "Standard"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-base-300">Job status</dt>
                <dd>
                  <StatusBadge status={job.status} />
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {showInviteModal && (
        <InterviewInviteModal
          applicationId={data.application_id}
          matchId={data.match.id}
          candidateName={candidateName}
          candidateEmail={data.resume.candidate_name ? undefined : undefined}
          jobTitle={job.title}
          company={job.company}
          recruiterName={user?.full_name}
          recruiterEmail={user?.email}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            setInviteNotice(
              `Interview invitation sent to ${candidateName}. In-app notification and email dispatched.`,
            );
          }}
        />
      )}
    </div>
  );
}

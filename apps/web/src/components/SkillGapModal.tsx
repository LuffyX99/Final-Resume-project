import SkillAlignment from "./SkillAlignment";
import type { JobApplication } from "../types";
import { deriveMatchInsight } from "../lib/matchInsight";

interface SkillGapModalProps {
  application: JobApplication;
  onClose: () => void;
}

export default function SkillGapModal({
  application,
  onClose,
}: SkillGapModalProps) {
  const insight = application.match
    ? deriveMatchInsight(application.match, application.job)
    : null;

  const readinessScore =
    application.readiness_score ?? insight?.readinessScore ?? null;
  const staleSkills =
    application.skill_gap_analysis?.stale_skills ??
    insight?.staleSkills ??
    [];
  const learningSteps =
    application.skill_gap_analysis?.learning_steps ??
    insight?.learningSteps ??
    [];

  const readinessColor =
    readinessScore !== null
      ? readinessScore >= 75
        ? "text-emerald-accent border-emerald-accent/30 bg-emerald-accent/10"
        : readinessScore >= 50
        ? "text-neon border-neon/30 bg-neon/10"
        : "text-amber-accent border-amber-accent/30 bg-amber-accent/10"
      : "text-base-400 border-base-700 bg-base-800";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-gap-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-base-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-base-700 bg-base-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-base-700/60 p-6">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-neon/80">
              Skill Gap & Readiness Analysis
            </p>
            <h2
              id="skill-gap-modal-title"
              className="mt-1 font-display text-2xl font-bold text-base-50"
            >
              {application.job.title}
            </h2>
            <p className="text-sm text-base-300">{application.job.company}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-base-400 hover:bg-base-800 hover:text-base-100 transition-colors duration-200"
            aria-label="Close dialog"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Readiness Score Card */}
          <div className="rounded-xl border border-base-700/80 bg-base-800/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-base-400">
                  Role Readiness Score
                </p>
                <p className="mt-1 text-xs text-base-300 max-w-sm">
                  Evaluates matched vs missing skills, placing double weight on critical recruiter-required skills and discounting stale technology.
                </p>
              </div>
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-2xl font-bold ${readinessColor}`}
              >
                <span>{readinessScore !== null ? `${readinessScore}%` : "Pending"}</span>
              </div>
            </div>

            {readinessScore !== null && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-base-700">
                  <div
                    className={`h-full transition-all duration-500 ${
                      readinessScore >= 75
                        ? "bg-emerald-accent"
                        : readinessScore >= 50
                        ? "bg-neon"
                        : "bg-amber-accent"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, readinessScore))}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Skill Breakdown */}
          <div className="rounded-xl border border-base-700/80 bg-base-800/40 p-5">
            <h3 className="font-display text-base font-bold text-base-50 mb-3">
              Skill Alignment
            </h3>
            {insight ? (
              <SkillAlignment
                requiredSkills={insight.requiredSkills}
                matchedSkills={insight.matchedSkills}
                missingSkills={insight.missingSkills}
                staleSkills={staleSkills}
              />
            ) : (
              <p className="text-xs text-base-400">
                Analysis pending completion of resume parsing.
              </p>
            )}
          </div>

          {/* Learning Recommendations */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-base font-bold text-base-50">
                Targeted Learning Recommendations
              </h3>
              {learningSteps.length > 0 && (
                <span className="rounded-full border border-neon/30 bg-neon/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-neon">
                  {learningSteps.length} step{learningSteps.length !== 1 && "s"}
                </span>
              )}
            </div>

            {learningSteps.length > 0 ? (
              <div className="space-y-3">
                {learningSteps.map((step) => (
                  <div
                    key={step.skill}
                    className="rounded-xl border border-base-700 bg-base-900/60 p-4 transition-colors hover:border-base-600"
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
                      <span className="text-base-300">{step.resource_hint}</span>
                      {step.estimated_time && (
                        <span className="font-mono text-neon/80">
                          {step.estimated_time}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-accent/20 bg-emerald-accent/5 p-4 text-center">
                <p className="text-xs text-emerald-accent">
                  Great job! You possess all modern required skills for this position.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-base-700/60 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-base-800 px-4 py-2 text-xs font-semibold text-base-200 hover:bg-base-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

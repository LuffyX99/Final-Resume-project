interface SkillAlignmentProps {
  requiredSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  staleSkills?: string[];
  compact?: boolean;
}

export default function SkillAlignment({
  requiredSkills,
  matchedSkills,
  missingSkills,
  staleSkills = [],
  compact = false,
}: SkillAlignmentProps) {
  if (requiredSkills.length === 0) {
    return (
      <p className="text-xs text-base-400">
        No required skills specified; ranked on semantic similarity.
      </p>
    );
  }

  const chipClass = compact
    ? "px-2 py-0.5 text-[10px]"
    : "px-2.5 py-1 text-xs";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-4"}>
      {!compact && (
        <p className="text-xs text-base-400">
          {matchedSkills.length} of {requiredSkills.length} required skills
          matched
        </p>
      )}

      {matchedSkills.length > 0 && (
        <div>
          {!compact && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-accent/80">
              Matched
            </p>
          )}
          <div
            className="flex flex-wrap gap-1.5"
            aria-label={`Matched skills: ${matchedSkills.join(", ")}`}
          >
            {matchedSkills.map((skill) => (
              <span
                key={skill}
                className={`inline-flex items-center gap-1 rounded-full border border-emerald-accent/20 bg-emerald-accent/10 font-medium text-emerald-accent ${chipClass}`}
              >
                <svg
                  className={compact ? "h-2.5 w-2.5" : "h-3 w-3"}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {staleSkills.length > 0 && (
        <div>
          {!compact && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-amber-accent/80">
              Stale (&gt;3 yrs / legacy)
            </p>
          )}
          <div
            className="flex flex-wrap gap-1.5"
            aria-label={`Stale skills: ${staleSkills.join(", ")}`}
          >
            {staleSkills.map((skill) => (
              <span
                key={skill}
                className={`inline-flex items-center gap-1 rounded-full border border-amber-accent/20 bg-amber-accent/10 font-medium text-amber-accent ${chipClass}`}
              >
                <svg
                  className={compact ? "h-2.5 w-2.5" : "h-3 w-3"}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {missingSkills.length > 0 && (
        <div>
          {!compact && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-rose-accent/80">
              Missing
            </p>
          )}
          <div
            className="flex flex-wrap gap-1.5"
            aria-label={`Missing skills: ${missingSkills.join(", ")}`}
          >
            {missingSkills.map((skill) => (
              <span
                key={skill}
                className={`inline-flex items-center gap-1 rounded-full border border-rose-accent/20 bg-rose-accent/10 font-medium text-rose-accent ${chipClass}`}
              >
                <svg
                  className={compact ? "h-2.5 w-2.5" : "h-3 w-3"}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

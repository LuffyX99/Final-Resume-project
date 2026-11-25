import { Link } from "react-router-dom";
import type { Job, JobApplication } from "../types";
import ApplicationStatusBadge from "./ApplicationStatusBadge";

function label(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function JobCard({
  job,
  application,
}: {
  job: Job;
  application?: JobApplication | null;
}) {
  const skills =
    job.required_skills.length > 0 ? job.required_skills : (job.skills ?? []);
  const meta = [job.location, label(job.job_type), label(job.experience)].filter(
    (value): value is string => Boolean(value),
  );

  return (
    <Link
      to={`/jobs/${job.id}`}
      className="glass-card group flex h-full flex-col p-6 hover:border-neon/20 transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-base-400">
            {job.company}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold leading-snug text-base-50 group-hover:text-neon transition-colors duration-200">
            {job.title}
          </h2>
        </div>
        {application && (
          <ApplicationStatusBadge status={application.status} />
        )}
      </div>

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

      {skills.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-neon/15 bg-neon/5 px-2.5 py-1 text-[11px] font-medium text-neon/90"
            >
              {skill}
            </span>
          ))}
          {skills.length > 5 && (
            <span className="rounded-full border border-base-600 px-2.5 py-1 text-[11px] text-base-400">
              +{skills.length - 5}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-base-600/40 pt-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-base-400">
          Posted {new Date(job.created_at).toLocaleDateString()}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-neon">
          {application ? "View application" : "View role"}
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
        </span>
      </div>
    </Link>
  );
}

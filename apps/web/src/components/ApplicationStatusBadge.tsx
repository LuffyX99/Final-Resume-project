import type { ApplicationStatus } from "../types";

interface StatusStyle {
  label: string;
  className: string;
  dotClassName: string;
}

const STYLES: Record<ApplicationStatus, StatusStyle> = {
  submitted: {
    label: "Submitted",
    className: "border-neon/20 bg-neon/10 text-neon",
    dotClassName: "bg-neon",
  },
  shortlisted: {
    label: "Shortlisted",
    className: "border-emerald-accent/25 bg-emerald-accent/10 text-emerald-accent",
    dotClassName: "bg-emerald-accent",
  },
  rejected: {
    label: "Not selected",
    className: "border-rose-accent/25 bg-rose-accent/10 text-rose-accent",
    dotClassName: "bg-rose-accent",
  },
  hired: {
    label: "Hired",
    className: "border-violet-accent/25 bg-violet-accent/10 text-violet-accent",
    dotClassName: "bg-violet-accent",
  },
  withdrawn: {
    label: "Withdrawn",
    className: "border-base-600 bg-base-700/70 text-base-300",
    dotClassName: "bg-base-400",
  },
};

export default function ApplicationStatusBadge({
  status,
}: {
  status: ApplicationStatus;
}) {
  const style = STYLES[status] ?? STYLES.submitted;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest ${style.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${style.dotClassName}`}
        aria-hidden="true"
      />
      {style.label}
    </span>
  );
}

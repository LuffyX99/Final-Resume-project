interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const isOpen = status.toLowerCase() === "open";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest ${
        isOpen
          ? "border-emerald-accent/20 bg-emerald-accent/10 text-emerald-accent"
          : "border-base-600 bg-base-700/70 text-base-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isOpen ? "bg-emerald-accent" : "bg-base-400"
        }`}
        aria-hidden="true"
      />
      {isOpen ? "Open" : "Closed"}
    </span>
  );
}

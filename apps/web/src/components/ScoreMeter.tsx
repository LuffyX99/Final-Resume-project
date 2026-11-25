interface ScoreMeterProps {
  score: number;
  label?: string;
  showValue?: boolean;
  fullWidth?: boolean;
}

export default function ScoreMeter({
  score,
  label,
  showValue = true,
  fullWidth = false,
}: ScoreMeterProps) {
  const safe = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
  const pct = Math.round(safe * 100);

  let barColor: string;
  if (pct >= 80) barColor = "bg-emerald-accent";
  else if (pct >= 60) barColor = "bg-amber-accent";
  else if (pct >= 40) barColor = "bg-orange-400";
  else barColor = "bg-rose-accent";

  return (
    <div
      className={fullWidth ? "w-full" : "w-24"}
      title={label ? `${label}: ${pct}%` : `${pct}%`}
    >
      {showValue && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-sm text-base-100">{pct}%</span>
        </div>
      )}
      <div
        className={`${showValue ? "mt-1.5" : ""} h-1 w-full overflow-hidden rounded-full bg-base-700`}
      >
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{
            width: `${pct}%`,
            animation: "progress-fill 0.7s ease-out",
          }}
        />
      </div>
    </div>
  );
}


export default function SessionLoader({
  label = "Checking your session...",
}: {
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-base-300 animate-fade-in">
      <div className="h-4 w-4 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
      {label}
    </div>
  );
}

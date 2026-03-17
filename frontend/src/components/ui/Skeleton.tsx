export default function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'var(--bg-elevated)' }} />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-2 w-32" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="glass-card p-4 space-y-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ label, value, trend, className }: StatCardProps) {
  const trendPositive = (trend?.value ?? 0) >= 0;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-5', className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
      {trend && (
        <p
          className={cn(
            'mt-1.5 text-xs font-medium',
            trendPositive ? 'text-emerald-600' : 'text-rose-600',
          )}
        >
          {trendPositive ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import { formatUsd } from '@/lib/utils';

interface CostBarProps {
  used: number;
  cap: number;
  className?: string;
}

export function CostBar({ used, cap, className }: CostBarProps) {
  const pct = cap > 0 ? Math.min((used / cap) * 100, 100) : 0;

  const barColor =
    pct >= 100
      ? 'bg-rose-500'
      : pct >= 90
        ? 'bg-orange-500'
        : pct >= 70
          ? 'bg-amber-400'
          : 'bg-emerald-500';

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatUsd(used)}</span>
        <span>{cap > 0 ? formatUsd(cap) : '∞'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

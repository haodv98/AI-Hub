import { cn } from '@/lib/utils';

type Status = 'ACTIVE' | 'ROTATING' | 'REVOKED' | 'EXPIRED' | 'OFFBOARDED' | 'SUSPENDED' | string;

const variantMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  ROTATING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  REVOKED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  EXPIRED: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  OFFBOARDED: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  SUSPENDED: 'bg-orange-50 text-orange-700 ring-orange-600/20',
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const classes = variantMap[status] ?? 'bg-gray-50 text-gray-600 ring-gray-500/20';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
        classes,
        className,
      )}
    >
      {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
    </span>
  );
}

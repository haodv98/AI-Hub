/* eslint-disable react/react-in-jsx-scope */
import { cn } from '@/lib/utils';

interface SegmentedFilterButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

export function SegmentedFilterButton({
  label,
  isActive,
  onClick,
  className,
}: SegmentedFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all',
        isActive ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:bg-white/5',
        className,
      )}
    >
      {label}
    </button>
  );
}

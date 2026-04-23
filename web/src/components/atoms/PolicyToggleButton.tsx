import { ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PolicyToggleButtonProps {
  active: boolean;
  onToggle: () => void;
  className?: string;
}

export function PolicyToggleButton({
  active,
  onToggle,
  className,
}: PolicyToggleButtonProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="Toggle policy active state"
      onClick={onToggle}
      className={cn(
        'p-1 rounded-full transition-all',
        active ? 'text-primary' : 'text-on-surface-variant opacity-20',
        className,
      )}
    >
      {active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
    </button>
  );
}

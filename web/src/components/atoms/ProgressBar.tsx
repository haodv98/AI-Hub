import { motion } from 'motion/react';

interface ProgressBarProps {
  label: string;
  current: string | number;
  total: string | number;
  color?: string;
}

export const ProgressBar = ({ label, current, total, color = 'bg-primary' }: ProgressBarProps) => {
  const parseValue = (val: string | number) => {
    if (typeof val === 'number') return val;
    return parseFloat(val.replace('$', '').replace('k', ''));
  };

  const currentVal = parseValue(current);
  const totalVal = parseValue(total);
  const percentage = Math.min((currentVal / totalVal) * 100, 100);

  return (
    <div className="group">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest mb-3">
        <span className="text-on-surface opacity-80">{label}</span>
        <span className="text-on-surface-variant font-mono">
          {current} / {total}
        </span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full ${color} transition-all duration-1000 status-glow shadow-[0_0_10px_rgba(56,189,248,0.3)]`}
        />
      </div>
    </div>
  );
};

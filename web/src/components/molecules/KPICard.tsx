import { motion } from 'motion/react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  unit: string;
  trend?: string;
  type?: 'up' | 'down' | 'stable';
}

export const KPICard = ({ title, value, unit, trend, type }: KPICardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="glass-panel p-6 rounded-2xl accent-border transition-all hover:brightness-110"
  >
    <div className="flex justify-between items-start mb-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant opacity-60">
        {title}
      </span>
      {trend && (
        <span
          className={`flex items-center font-bold text-[10px] ${
            type === 'up' ? 'text-primary' : type === 'down' ? 'text-error' : 'text-on-surface-variant'
          }`}
        >
          {type === 'up' && <TrendingUp className="w-3 h-3 mr-1" />}
          {type === 'down' && <TrendingDown className="w-3 h-3 mr-1" />}
          {trend}
        </span>
      )}
    </div>
    <div className="flex items-baseline">
      <span className="text-3xl font-mono font-extrabold text-on-surface tracking-tighter">
        {value}
      </span>
      <span className="ml-2 text-[10px] font-bold text-on-surface-variant opacity-50 uppercase">
        {unit}
      </span>
    </div>
  </motion.div>
);

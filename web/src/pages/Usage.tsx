/* eslint-disable react/react-in-jsx-scope */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Box,
  ChevronRight,
  Cpu,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SegmentedFilterButton } from '@/components/atoms/SegmentedFilterButton';
import { ExportButton } from '@/components/usage/ExportButton';
import { UsageHeatmap } from '@/components/usage/UsageHeatmap';
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { useAuth } from '@/contexts/AuthContext';
import { canUseCapability } from '@/lib/capabilities';
import { presetToDateRange } from '@/lib/date-range';
import { formatNumber, formatUsd } from '@/lib/utils';
import { getEnvelope } from '@/lib/api';

interface DailySummaryRow {
  date: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

interface TeamSummaryRow {
  teamId: string;
  teamName: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

interface OrgSummary {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  teamCount: number;
  byDay: DailySummaryRow[];
  byTeam: TeamSummaryRow[];
  providerBreakdown: { provider: string; value: number }[];
  modelUsage: { model: string; requestCount: number }[];
  topUsers: { userId: string; name: string; team: string; spendUsd: number; tokens: number; growthPct: number }[];
  latency: { avgMs: number };
  trends: { spendPct: number; tokensPct: number; requestsPct: number };
}

const COLORS = ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985'];

export default function Usage() {
  const { isAdmin, isTeamLead } = useAuth();
  const role = { isAdmin, isTeamLead };
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const dateRange = useMemo(() => presetToDateRange(range), [range]);

  const { data, isLoading, isError, refetch } = useQuery<OrgSummary>({
    queryKey: ['usage', 'summary', dateRange.from, dateRange.to],
    queryFn: () => getEnvelope<OrgSummary>('/usage/summary', { from: dateRange.from, to: dateRange.to }),
  });

  const noUsageInRange =
    !isLoading &&
    !isError &&
    data &&
    (data.totalRequests ?? 0) === 0 &&
    (data.byDay?.length ?? 0) === 0 &&
    (data.byTeam?.length ?? 0) === 0;

  const dailySpend = (data?.byDay ?? []).map((row) => ({
    date: row.date.slice(5),
    spend: row.costUsd,
  }));
  const teamUsage = (data?.byTeam ?? []).map((row) => ({
    name: row.teamName,
    spend: row.costUsd,
  }));
  const providerBreakdown = (data?.providerBreakdown ?? []).map((item) => ({
    name: item.provider,
    value: item.value,
  }));
  const modelUsage = (data?.modelUsage ?? []).map((item) => ({
    name: item.model,
    usage: item.requestCount,
  }));

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black text-on-surface tracking-tighter uppercase"
          >
            Usage <span className="text-primary opacity-80">Intelligence</span>
          </motion.h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Real-time telemetry across all compute engine clusters. Calibrate expenditure and optimize token allocation profiles.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-panel p-1 rounded-xl flex" role="group" aria-label="Usage time range">
            {(['7d', '30d', '90d'] as const).map((item) => (
              <SegmentedFilterButton
                key={item}
                label={item}
                isActive={range === item}
                onClick={() => setRange(item)}
                className="px-4"
              />
            ))}
          </div>
          {canUseCapability(role, 'usage.export') ? (
            <ExportButton from={dateRange.from} to={dateRange.to} />
          ) : null}
        </div>
      </div>

      {isError && (
        <ErrorPanel message="Failed to load usage summary (envelope or 403)." onRetry={() => void refetch()} />
      )}

      {noUsageInRange && (
        <EmptyState message="No usage recorded for this date range. KPIs and charts reflect zeros until data exists for the selected window." />
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
          { label: 'Total Spend', value: formatUsd(data?.totalCost ?? 0), trend: `${data?.trends?.spendPct ?? 0}%`, icon: TrendingUp, positive: (data?.trends?.spendPct ?? 0) >= 0 },
          { label: 'Token Volume', value: formatNumber(data?.totalTokens ?? 0), trend: `${data?.trends?.tokensPct ?? 0}%`, icon: Box, positive: (data?.trends?.tokensPct ?? 0) >= 0 },
          { label: 'Avg Latency', value: `${Math.round(data?.latency?.avgMs ?? 0)}ms`, trend: 'Live', icon: Cpu, positive: true },
          { label: 'Active Teams', value: String(data?.teamCount ?? 0), trend: `${data?.trends?.requestsPct ?? 0}% req`, icon: Users, positive: (data?.trends?.requestsPct ?? 0) >= 0 },
        ].map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-panel p-6 rounded-3xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <card.icon className="w-12 h-12" />
            </div>
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2">{card.label}</p>
            <h3 className="text-2xl font-black text-on-surface tracking-tight">{isLoading ? '...' : card.value}</h3>
            <div className="flex items-center gap-2 mt-4">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${card.positive ? 'bg-tertiary/10 text-tertiary' : 'bg-white/5 text-on-surface-variant'}`}>
                {card.trend}
              </span>
              <span className="text-[8px] font-bold text-on-surface-variant opacity-40 uppercase tracking-widest italic">vs Prev Period</span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 glass-panel p-8 rounded-3xl h-[400px] flex flex-col">
          <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3 mb-8">
            <TrendingUp className="text-primary w-5 h-5" /> Spend Trajectory
          </h3>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySpend}>
                <defs>
                  <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <Tooltip />
                <Area type="monotone" dataKey="spend" stroke="#38bdf8" strokeWidth={4} fillOpacity={1} fill="url(#colorSpend)" animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 glass-panel p-8 rounded-3xl h-[400px] flex flex-col">
          <h3 className="text-xl font-black uppercase tracking-tight mb-8">Provider Flux</h3>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={providerBreakdown} cx="50%" cy="45%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">
                  {providerBreakdown.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 glass-panel p-8 rounded-3xl h-[400px] flex flex-col">
          <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3 mb-8">
            <Users className="text-primary w-5 h-5" /> Division Spend
          </h3>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamUsage} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} width={100} />
                <Tooltip />
                <Bar dataKey="spend" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 glass-panel p-8 rounded-3xl h-[400px] flex flex-col">
          <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3 mb-8">
            <Cpu className="text-primary w-5 h-5" /> Engine Invocations
          </h3>
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelUsage}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                <Tooltip />
                <Bar dataKey="usage" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={40}>
                  {modelUsage.map((entry, index) => (
                    <Cell key={entry.name} fill={index === 0 ? '#38bdf8' : 'rgba(56, 189, 248, 0.4)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-x-auto border border-white/5">
        <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center">
          <h3 className="text-xl font-black uppercase tracking-tight">High Consumption Subjects</h3>
          <button type="button" className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-all">
            View All Nodes →
          </button>
        </div>
        <table className="w-full min-w-[920px] text-left">
          <thead>
            <tr className="bg-white/5">
              <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Authorized Operator</th>
              <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Division</th>
              <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Expenditure</th>
              <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Flux Load</th>
              <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Growth</th>
              <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Drill-down</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!isLoading &&
              !isError &&
              !noUsageInRange &&
              (data?.topUsers ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-8">
                    <EmptyState message="No ranked operators for this range (or insufficient aggregate data)." />
                  </td>
                </tr>
              )}
            {(data?.topUsers ?? []).map((user) => (
              <tr key={user.userId} className="group hover:bg-white/5 transition-all">
                <td className="px-8 py-8">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-black text-xs text-primary">
                      {user.name[0]}
                    </div>
                    <span className="text-xs font-black text-on-surface uppercase tracking-wider">{user.name}</span>
                  </div>
                </td>
                <td className="px-8 py-8">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{user.team}</span>
                </td>
                <td className="px-8 py-8">
                  <span className="text-xs font-mono font-bold text-primary">{formatUsd(user.spendUsd)}</span>
                </td>
                <td className="px-8 py-8">
                  <span className="text-xs font-mono font-bold text-on-surface opacity-80">{formatNumber(user.tokens)}</span>
                </td>
                <td className="px-8 py-8">
                  <div className="flex items-center gap-2">
                    {user.growthPct >= 0 ? <ArrowUpRight className="w-3 h-3 text-tertiary" /> : <ArrowDownRight className="w-3 h-3 text-error" />}
                    <span className={`text-[10px] font-black uppercase tracking-widest ${user.growthPct >= 0 ? 'text-tertiary' : 'text-error'}`}>
                      {`${user.growthPct}%`}
                    </span>
                  </div>
                </td>
                <td className="px-8 py-8 text-right">
                  <Link to={`/members/${user.userId}`} className="p-2 glass-panel group-hover:text-primary transition-all rounded-lg opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UsageHeatmap from={dateRange.from} to={dateRange.to} />
    </div>
  );
}

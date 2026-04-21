import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { StatCard } from '@/components/ui/StatCard';
import { formatUsd, formatNumber } from '@/lib/utils';
import api from '@/lib/api';

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
}

function useDashboardSummary() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];
  return useQuery<OrgSummary>({
    queryKey: ['usage', 'summary', from, to],
    queryFn: () => api.get(`/usage/summary?from=${from}&to=${to}`).then((r) => r.data.data),
    refetchInterval: 60_000,
  });
}

function SpendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-muted-foreground">{formatUsd(payload[0].value)}</p>
    </div>
  );
}

function TeamTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-muted-foreground">{formatUsd(payload[0].value)}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading } = useDashboardSummary();

  const chartDays = (summary?.byDay ?? []).map((d) => ({
    ...d,
    label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(d.date),
    ),
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-muted animate-pulse" />
          ))
        ) : (
          <>
            <StatCard label="Spend MTD" value={formatUsd(summary?.totalCost ?? 0)} />
            <StatCard label="Total Requests" value={formatNumber(summary?.totalRequests ?? 0)} />
            <StatCard label="Total Tokens" value={formatNumber(summary?.totalTokens ?? 0)} />
            <StatCard label="Active Teams" value={String(summary?.teamCount ?? 0)} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Spend trend */}
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Spend trend (last 30 days)</h2>
          {isLoading ? (
            <div className="h-48 bg-muted animate-pulse rounded-lg" />
          ) : chartDays.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No spend data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={chartDays} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={48}
                />
                <Tooltip content={<SpendTooltip />} />
                <Area
                  type="monotone"
                  dataKey="costUsd"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#spendGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top teams */}
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Top teams by spend</h2>
          {isLoading ? (
            <div className="h-48 bg-muted animate-pulse rounded-lg" />
          ) : (summary?.byTeam ?? []).length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No team data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <BarChart
                data={summary!.byTeam}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="teamName"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip content={<TeamTooltip />} />
                <Bar dataKey="costUsd" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

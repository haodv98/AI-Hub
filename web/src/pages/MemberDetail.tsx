import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { formatUsd, formatNumber, formatDate } from '@/lib/utils';
import api from '@/lib/api';

interface ApiKey {
  id: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface EffectivePolicy {
  allowedEngines: string[];
  limits: {
    rpm?: number;
    dailyTokens?: number;
    monthlyBudgetUsd?: number;
  };
}

interface MemberDetail {
  id: string;
  email: string;
  fullName: string;
  status: string;
  role: string;
  teamMembers: Array<{ team: { id: string; name: string }; tier: string }>;
  apiKeys?: ApiKey[];
}

interface UsageSummaryRow {
  date: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

function useMemberDetail(id: string) {
  return useQuery<MemberDetail>({
    queryKey: ['members', id],
    queryFn: () => api.get(`/users/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

function useMemberUsage(id: string) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];
  return useQuery<UsageSummaryRow[]>({
    queryKey: ['usage', 'user', id, from, to],
    queryFn: () =>
      api.get(`/usage?userId=${id}&from=${from}&to=${to}`).then((r) => r.data.data ?? []),
    enabled: !!id,
  });
}

function useEffectivePolicy(id: string) {
  return useQuery<EffectivePolicy | null>({
    queryKey: ['policies', 'resolve', id],
    queryFn: () =>
      api
        .get(`/policies/resolve?userId=${id}`)
        .then((r) => r.data.data)
        .catch(() => null),
    enabled: !!id,
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

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: member, isLoading } = useMemberDetail(id!);
  const { data: usageRows, isLoading: usageLoading } = useMemberUsage(id!);
  const { data: policy } = useEffectivePolicy(id!);

  const totalCost = (usageRows ?? []).reduce((sum, r) => sum + r.costUsd, 0);
  const totalTokens = (usageRows ?? []).reduce((sum, r) => sum + r.totalTokens, 0);
  const totalRequests = (usageRows ?? []).reduce((sum, r) => sum + r.requestCount, 0);

  const chartData = (usageRows ?? []).map((r) => ({
    ...r,
    label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(r.date),
    ),
  }));

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <TableSkeleton rows={3} cols={3} />
      </div>
    );
  }

  if (!member) return null;

  const activeKey = member.apiKeys?.find((k) => k.status === 'ACTIVE');
  const primaryTeam = member.teamMembers[0];

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link to="/members" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1">
          ← Members
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{member.fullName}</h1>
          <StatusBadge status={member.status} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">{member.email}</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Spend (30d)" value={formatUsd(totalCost)} />
        <StatCard label="Requests (30d)" value={formatNumber(totalRequests)} />
        <StatCard label="Tokens (30d)" value={formatNumber(totalTokens)} />
        <StatCard
          label="Team / Tier"
          value={primaryTeam ? `${primaryTeam.team.name} · ${primaryTeam.tier.toLowerCase()}` : '—'}
        />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* Personal usage chart */}
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Daily spend (last 30 days)</h2>
          {usageLoading ? (
            <div className="h-48 bg-muted animate-pulse rounded-lg" />
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              No usage data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="memberSpendGrad" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#memberSpendGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Key status + policy */}
        <div className="space-y-4">
          {/* API key card */}
          <div className="rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold mb-3">API Key</h2>
            {activeKey ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">{activeKey.keyPrefix}…</span>
                  <StatusBadge status={activeKey.status} />
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Created: {formatDate(activeKey.createdAt)}</p>
                  <p>Last used: {activeKey.lastUsedAt ? formatDate(activeKey.lastUsedAt) : 'Never'}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active key</p>
            )}
          </div>

          {/* Effective policy */}
          <div className="rounded-xl border border-border p-5">
            <h2 className="text-sm font-semibold mb-3">Effective Policy</h2>
            {policy ? (
              <div className="text-sm space-y-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Engines</span>
                  <p className="mt-1">
                    {policy.allowedEngines.length === 0
                      ? 'All engines allowed'
                      : policy.allowedEngines.join(', ')}
                  </p>
                </div>
                {policy.limits.monthlyBudgetUsd && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly budget</span>
                    <p className="mt-1">{formatUsd(policy.limits.monthlyBudgetUsd)}</p>
                  </div>
                )}
                {policy.limits.rpm && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rate limit</span>
                    <p className="mt-1">{policy.limits.rpm} RPM</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No policy resolved</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

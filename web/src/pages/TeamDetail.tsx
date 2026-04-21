import { Link, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { formatUsd, formatNumber } from '@/lib/utils';
import api from '@/lib/api';
import { useState } from 'react';

interface TeamMember {
  userId: string;
  tier: string;
  user: { id: string; email: string; fullName: string; status: string };
}

interface TeamDetail {
  id: string;
  name: string;
  description: string | null;
  monthlyBudgetUsd: number;
  members: TeamMember[];
}

interface UsageSummaryRow {
  date: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

function useTeamDetail(id: string) {
  return useQuery<TeamDetail>({
    queryKey: ['teams', id],
    queryFn: () => api.get(`/teams/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

function useTeamUsage(id: string) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];
  return useQuery<UsageSummaryRow[]>({
    queryKey: ['usage', 'teams', id, from, to],
    queryFn: () =>
      api.get(`/usage/teams/${id}?from=${from}&to=${to}`).then((r) => r.data.data),
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

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: team, isLoading: teamLoading } = useTeamDetail(id!);
  const { data: usageRows, isLoading: usageLoading } = useTeamUsage(id!);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/teams/${id}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', id] });
      setRemoveTarget(null);
    },
  });

  const totalCost = (usageRows ?? []).reduce((sum, r) => sum + r.costUsd, 0);
  const totalTokens = (usageRows ?? []).reduce((sum, r) => sum + r.totalTokens, 0);
  const totalRequests = (usageRows ?? []).reduce((sum, r) => sum + r.requestCount, 0);

  const chartData = (usageRows ?? []).map((r) => ({
    ...r,
    label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(r.date),
    ),
  }));

  if (teamLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-muted animate-pulse" />
          ))}
        </div>
        <TableSkeleton rows={5} cols={4} />
      </div>
    );
  }

  if (!team) return null;

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link to="/teams" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1">
          ← Teams
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
        {team.description && (
          <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Spend (30d)" value={formatUsd(totalCost)} />
        <StatCard label="Requests (30d)" value={formatNumber(totalRequests)} />
        <StatCard label="Tokens (30d)" value={formatNumber(totalTokens)} />
      </div>

      {/* Daily spend chart */}
      <div className="rounded-xl border border-border p-5 mb-8">
        <h2 className="text-sm font-semibold mb-4">Daily spend (last 30 days)</h2>
        {usageLoading ? (
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
            No usage data in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={192}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="teamSpendGrad" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#teamSpendGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Members table */}
      <div>
        <h2 className="text-base font-semibold mb-3">
          Members ({team.members.length})
        </h2>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tier</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {team.members.map((m) => (
                <tr key={m.userId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{m.user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground capitalize">
                      {m.tier.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={m.user.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setRemoveTarget(m.userId)}
                      className="text-xs text-rose-600 hover:text-rose-800"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {team.members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No members in this team
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove member"
        description="This will remove the member from this team. Their account and API key remain active."
        confirmLabel="Remove"
        destructive
        onConfirm={() => removeTarget && removeMember.mutate(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

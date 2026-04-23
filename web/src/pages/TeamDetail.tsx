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
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { useAuth } from '@/contexts/AuthContext';
import { formatUsd, formatNumber } from '@/lib/utils';
import { canUseCapability } from '@/lib/capabilities';
import { monthToDateRange } from '@/lib/date-range';
import {
  deleteEnvelope,
  getEnvelope,
  postEnvelope,
  putEnvelope,
} from '@/lib/api';
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
    queryFn: () => getEnvelope(`/teams/${id}`),
    enabled: !!id,
  });
}

function useTeamUsage(id: string) {
  const { from, to } = monthToDateRange();
  return useQuery<UsageSummaryRow[]>({
    queryKey: ['usage', 'teams', id, from, to],
    queryFn: () => getEnvelope(`/usage/teams/${id}`, { from, to }),
    enabled: !!id,
  });
}

interface SpendTooltipPayload {
  value: number;
}

function SpendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: SpendTooltipPayload[];
  label?: string;
}) {
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
  const { isAdmin, isTeamLead } = useAuth();
  const role = { isAdmin, isTeamLead };
  const teamQuery = useTeamDetail(id!);
  const usageQuery = useTeamUsage(id!);
  const team = teamQuery.data;
  const usageRows = usageQuery.data;
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberTier, setNewMemberTier] = useState<'MEMBER' | 'SENIOR' | 'LEAD'>('MEMBER');
  const [budgetInput, setBudgetInput] = useState('');
  const [tierTarget, setTierTarget] = useState<{ userId: string; tier: 'MEMBER' | 'SENIOR' | 'LEAD' } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const removeMember = useMutation({
    mutationFn: (userId: string) => deleteEnvelope(`/teams/${id}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', id] });
      setRemoveTarget(null);
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to remove member.');
    },
  });

  const addMember = useMutation({
    mutationFn: () =>
      postEnvelope(`/teams/${id}/members`, {
        userId: newMemberId.trim(),
        tier: newMemberTier,
      }),
    onSuccess: () => {
      setNewMemberId('');
      qc.invalidateQueries({ queryKey: ['teams', id] });
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to add member.');
    },
  });

  const updateBudget = useMutation({
    mutationFn: () =>
      putEnvelope(`/teams/${id}`, {
        monthlyBudgetUsd: Number(budgetInput),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', id] });
      setBudgetInput('');
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to update budget.');
    },
  });

  const changeTier = useMutation({
    mutationFn: ({ userId, tier }: { userId: string; tier: 'MEMBER' | 'SENIOR' | 'LEAD' }) =>
      putEnvelope(`/teams/${id}/members/${userId}/tier`, { tier }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', id] });
      setTierTarget(null);
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to change member tier.');
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

  if (teamQuery.isLoading) {
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

      {(teamQuery.isError || usageQuery.isError) && (
        <ErrorPanel
          message="Failed to load team data."
          onRetry={() => {
            teamQuery.refetch();
            usageQuery.refetch();
          }}
        />
      )}
      {mutationError && <ErrorPanel message={mutationError} onRetry={() => setMutationError(null)} />}

      {canUseCapability(role, 'teams.addMember') && (
        <div className="rounded-xl border border-border p-4 mb-8">
          <h2 className="text-sm font-semibold mb-3">Add member</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={newMemberId}
              onChange={(event) => setNewMemberId(event.target.value)}
              placeholder="User ID"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={newMemberTier}
              onChange={(event) => setNewMemberTier(event.target.value as 'MEMBER' | 'SENIOR' | 'LEAD')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="MEMBER">MEMBER</option>
              <option value="SENIOR">SENIOR</option>
              <option value="LEAD">LEAD</option>
            </select>
            <button
              type="button"
              onClick={() => addMember.mutate()}
              disabled={!newMemberId.trim() || addMember.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {addMember.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {canUseCapability(role, 'teams.updateBudget') && (
        <div className="rounded-xl border border-border p-4 mb-8">
          <h2 className="text-sm font-semibold mb-3">Update monthly budget</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="number"
              min={0}
              step={1}
              placeholder="USD amount"
              value={budgetInput}
              onChange={(event) => setBudgetInput(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => updateBudget.mutate()}
              disabled={!budgetInput || updateBudget.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {updateBudget.isPending ? 'Saving…' : 'Save budget'}
            </button>
          </div>
        </div>
      )}

      {/* Daily spend chart */}
      <div className="rounded-xl border border-border p-5 mb-8">
        <h2 className="text-sm font-semibold mb-4">Daily spend (last 30 days)</h2>
        {usageQuery.isLoading ? (
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
                    <div className="flex items-center gap-3">
                      {canUseCapability(role, 'teams.changeTier') && (
                        <button
                          type="button"
                          onClick={() => setTierTarget({ userId: m.userId, tier: m.tier as 'MEMBER' | 'SENIOR' | 'LEAD' })}
                          className="text-xs text-primary hover:underline"
                        >
                          Change tier
                        </button>
                      )}
                      {canUseCapability(role, 'teams.removeMember') && (
                        <button
                          onClick={() => setRemoveTarget(m.userId)}
                          className="text-xs text-rose-600 hover:text-rose-800"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {team.members.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10">
                    <EmptyState message="No members in this team" />
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

      {tierTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-base font-semibold mb-4">Change member tier</h2>
            <select
              value={tierTarget.tier}
              onChange={(event) => setTierTarget({ ...tierTarget, tier: event.target.value as 'MEMBER' | 'SENIOR' | 'LEAD' })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mb-5"
            >
              <option value="MEMBER">MEMBER</option>
              <option value="SENIOR">SENIOR</option>
              <option value="LEAD">LEAD</option>
            </select>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setTierTarget(null)} className="px-4 py-2 text-sm rounded-md border border-border">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => changeTier.mutate(tierTarget)}
                disabled={changeTier.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md disabled:opacity-50"
              >
                {changeTier.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

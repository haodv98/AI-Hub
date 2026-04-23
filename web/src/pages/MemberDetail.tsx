/* eslint-disable react/react-in-jsx-scope */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  ChevronLeft,
  CirclePlus,
  CircleX,
  Cloud,
  Cpu,
  Lock,
} from 'lucide-react';
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
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { useAuth } from '@/contexts/AuthContext';
import { formatUsd, formatNumber, formatDate } from '@/lib/utils';
import { canUseCapability } from '@/lib/capabilities';
import { monthToDateRange } from '@/lib/date-range';
import { getEnvelope, postEnvelope } from '@/lib/api';

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
  providerKeys?: Array<{
    provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE';
    scope: 'PER_SEAT' | 'SHARED';
    vaultPath: string;
    assignedAt: string;
  }>;
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
    queryFn: () => getEnvelope(`/users/${id}`),
    enabled: !!id,
  });
}

function useMemberUsage(id: string) {
  const { from, to } = monthToDateRange();
  return useQuery<UsageSummaryRow[]>({
    queryKey: ['usage', 'user', id, from, to],
    queryFn: () => getEnvelope(`/usage`, { userId: id, from, to }),
    enabled: !!id,
  });
}

function useEffectivePolicy(id: string) {
  return useQuery<EffectivePolicy | null>({
    queryKey: ['policies', 'resolve', id],
    queryFn: () =>
      getEnvelope<EffectivePolicy>(`/policies/resolve`, { userId: id })
        .catch(() => null),
    enabled: !!id,
  });
}

function SpendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
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

export default function MemberDetail() {
  const qc = useQueryClient();
  const { isAdmin, isTeamLead } = useAuth();
  const role = { isAdmin, isTeamLead };
  const { id } = useParams<{ id: string }>();
  const memberQuery = useMemberDetail(id!);
  const usageQuery = useMemberUsage(id!);
  const { data: member, isLoading } = memberQuery;
  const { data: usageRows, isLoading: usageLoading } = usageQuery;
  const { data: policy } = useEffectivePolicy(id!);
  const [provider, setProvider] = useState<'ANTHROPIC' | 'OPENAI' | 'GOOGLE'>('ANTHROPIC');
  const [apiKey, setApiKey] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const assignPerSeatKey = useMutation({
    mutationFn: () => postEnvelope(`/users/${id}/provider-keys/assign`, { provider, apiKey }),
    onSuccess: () => {
      setApiKey('');
      qc.invalidateQueries({ queryKey: ['members', id] });
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to assign provider key.');
    },
  });

  const totalCost = (usageRows ?? []).reduce((sum, r) => sum + r.costUsd, 0);
  const totalTokens = (usageRows ?? []).reduce((sum, r) => sum + r.totalTokens, 0);
  const totalRequests = (usageRows ?? []).reduce((sum, r) => sum + r.requestCount, 0);

  const chartData = useMemo(
    () =>
      (usageRows ?? []).map((r) => ({
        ...r,
        label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
          new Date(r.date),
        ),
      })),
    [usageRows],
  );

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
    <div className="space-y-8 pb-12 overflow-hidden">
      <Link
        to="/members"
        className="flex items-center text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-all"
      >
        <ChevronLeft className="w-4 h-4 mr-2" /> Return to Fleet Registry
      </Link>

      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 glass-panel p-10 rounded-3xl accent-border relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.05)_0%,transparent_70%)] pointer-events-none"></div>
        <div className="flex gap-8 items-center relative z-10">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/20 flex items-center justify-center text-primary font-black text-2xl">
            {member.fullName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h2 className="text-4xl font-black tracking-tighter text-on-surface uppercase">{member.fullName}</h2>
              <StatusBadge status={member.status} />
            </div>
            <p className="text-[10px] font-mono text-primary uppercase tracking-[0.2em] font-bold">
              Signal: {member.id} - Dept: {primaryTeam?.team.name ?? 'Unassigned'}
            </p>
            <p className="text-sm text-on-surface-variant mt-4 max-w-md font-medium leading-relaxed opacity-80 uppercase tracking-wide">
              Overseeing high-latency neural streams. Access level and policy overlays are synchronized from backend resolution.
            </p>
          </div>
        </div>
        <div className="flex gap-4 relative z-10 w-full md:w-auto">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant opacity-70">
            Key revoke/rotate action is managed in key lifecycle module
          </p>
        </div>
      </section>

      {(memberQuery.isError || usageQuery.isError) && (
        <ErrorPanel
          message="Failed to load member details."
          onRetry={() => {
            memberQuery.refetch();
            usageQuery.refetch();
          }}
        />
      )}
      {mutationError && <ErrorPanel message={mutationError} onRetry={() => setMutationError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-panel p-8 rounded-3xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></div>
              <span className="text-[9px] font-mono font-bold text-primary uppercase tracking-widest">
                Live telemetry
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-bold uppercase tracking-tight">Signal Intensity</h3>
            <div className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-40">
              Flux Vol: {formatNumber(totalTokens)} Delta
            </div>
          </div>
          {usageLoading ? (
            <div className="h-48 bg-muted animate-pulse rounded-lg" />
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No usage data</div>
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="memberSpendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={48} />
                  <Tooltip content={<SpendTooltip />} />
                  <Area type="monotone" dataKey="costUsd" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#memberSpendGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="glass-panel p-8 rounded-3xl">
          <h3 className="text-xl font-bold uppercase tracking-tight mb-8">Active Protocols</h3>
          <ul className="space-y-8">
            <li className="flex items-start gap-4">
              <BadgeCheck className="text-primary w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black text-on-surface uppercase tracking-[0.2em]">Flow Rate</p>
                <p className="text-xs text-primary font-mono mt-1 font-bold">{formatNumber(totalRequests)} Req</p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <Lock className="text-primary w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black text-on-surface uppercase tracking-[0.2em]">Daily Quota</p>
                <p className="text-xs text-primary font-mono mt-1 font-bold">
                  {policy?.limits?.dailyTokens ? formatNumber(policy?.limits?.dailyTokens) : 'N/A'}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-4">
              <Cpu className="text-primary w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black text-on-surface uppercase tracking-[0.2em]">Authorized Cores</p>
                <p className="text-xs text-on-surface-variant mt-1 font-bold uppercase tracking-wider text-[11px]">
                  {policy?.allowedEngines.length ? policy.allowedEngines.join(', ') : 'ALL'}
                </p>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Spend (30d)" value={formatUsd(totalCost)} />
        <StatCard label="Requests (30d)" value={formatNumber(totalRequests)} />
        <StatCard label="Tokens (30d)" value={formatNumber(totalTokens)} />
        <StatCard
          label="Team / Tier"
          value={primaryTeam ? `${primaryTeam.team.name} · ${primaryTeam.tier.toLowerCase()}` : '—'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="glass-panel p-8 rounded-3xl relative overflow-hidden group">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-bold uppercase tracking-tight flex items-center gap-3">
              Operational Keys
            </h3>
            <span className="text-[9px] font-mono text-primary font-bold uppercase tracking-[0.3em] bg-primary/10 px-2 py-0.5 rounded">
              {(member.apiKeys ?? []).length} Active Streams
            </span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.3em] opacity-40 border-b border-white/5 pb-4">
                <th scope="col" className="pb-4">Designation</th>
                <th scope="col" className="pb-4">Calibrated</th>
                <th scope="col" className="pb-4">Status</th>
                <th scope="col" className="pb-4 text-right">Ops</th>
              </tr>
            </thead>
            <tbody className="text-xs uppercase tracking-widest font-bold">
              {(member.apiKeys ?? []).map((key) => (
                <tr key={key.id} className="group/row hover:bg-white/5 transition-all">
                  <td className="py-5 font-mono font-bold text-primary group-hover/row:translate-x-1 transition-transform">
                    {key.keyPrefix}
                  </td>
                  <td className="py-5 text-on-surface-variant opacity-60 font-mono text-[10px]">
                    {formatDate(key.createdAt)}
                  </td>
                  <td className="py-5">
                    <StatusBadge status={key.status} />
                  </td>
                  <td className="py-5 text-right">
                    <span className="text-[9px] uppercase tracking-[0.2em] text-on-surface-variant opacity-60">
                      Managed by API key module
                    </span>
                  </td>
                </tr>
              ))}
              {(member.apiKeys ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-5">
                    <EmptyState message="No active operational keys" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-panel p-8 rounded-3xl relative overflow-hidden group">
          <div className="flex justify-between items-center mb-10">
            <h3 className="text-xl font-bold uppercase tracking-tight">Assigned Clusters</h3>
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-60">
              Managed in provider key assignment
            </span>
          </div>
          <div className="space-y-4">
            <div className="p-6 bg-white/5 border border-white/5 border-l-4 border-primary flex justify-between items-center rounded-2xl group/card relative overflow-hidden hover:bg-white/10 transition-all">
              <div className="flex items-center gap-6 relative z-10">
                <div className="w-14 h-14 bg-surface flex items-center justify-center border border-white/10 rounded-2xl status-glow">
                  <Cloud className="text-primary w-7 h-7" />
                </div>
                <div>
                  <p className="text-lg font-black text-on-surface uppercase tracking-tight">
                    {member.providerKeys?.[0]?.provider ?? 'Shared-Cluster'}
                  </p>
                  <p className="text-[10px] text-primary font-mono mt-1 opacity-70">
                    {member.providerKeys?.[0]?.vaultPath ?? 'No cluster linked'}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end relative z-10">
                <span className="text-[10px] font-black text-primary uppercase mb-2 tracking-[0.2em]">
                  OVERSIGHT_TIER
                </span>
                <CircleX className="w-5 h-5 text-on-surface-variant opacity-40" />
              </div>
            </div>

            <div className="p-8 border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-4 group hover:bg-white/5 hover:border-primary/20 transition-all cursor-pointer rounded-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <CirclePlus className="text-on-surface-variant w-10 h-10 group-hover:text-primary transition-all relative z-10" />
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.3em] group-hover:text-primary transition-all relative z-10">
                Integrate New Cluster
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="glass-panel p-5 rounded-2xl">
          <h2 className="text-sm font-semibold mb-3">Effective Policy</h2>
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

        <div className="glass-panel p-5 rounded-2xl">
            <h2 className="text-sm font-semibold mb-3">API Key</h2>
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
              {policy.limits?.monthlyBudgetUsd && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly budget</span>
                  <p className="mt-1">{formatUsd(policy.limits?.monthlyBudgetUsd)}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No policy resolved</p>
          )}
        </div>

        <div className="glass-panel p-5 rounded-2xl">
          <h2 className="text-sm font-semibold mb-3">Provider Keys (PER_SEAT)</h2>
          <div className="space-y-3 mb-4">
            {(member.providerKeys ?? []).length > 0 ? (
              member.providerKeys?.map((k) => (
                <div key={`${k.provider}-${k.vaultPath}`} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{k.provider}</span>
                    <span className="text-[11px] text-muted-foreground">{k.scope}</span>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground mt-1 break-all">{k.vaultPath}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No per-seat keys assigned</p>
            )}
          </div>

          {canUseCapability(role, 'member.assignProviderKey') ? (
            <div className="space-y-2">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'ANTHROPIC' | 'OPENAI' | 'GOOGLE')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="ANTHROPIC">Anthropic</option>
              <option value="OPENAI">OpenAI</option>
              <option value="GOOGLE">Google</option>
            </select>
            <input
              type="password"
              placeholder="Paste seat API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => assignPerSeatKey.mutate()}
              disabled={!apiKey.trim() || assignPerSeatKey.isPending}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {assignPerSeatKey.isPending ? 'Assigning…' : 'Assign Seat Key'}
            </button>
            </div>
          ) : (
            <EmptyState message="Provider key assignment is available for admin role only." />
          )}
        </div>
      </div>

      <section className="glass-panel p-8 rounded-3xl border-transparent font-mono text-[11px] overflow-hidden relative">
        <div className="absolute inset-0 bg-primary/5 pointer-events-none opacity-20"></div>
        <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary status-glow animate-pulse"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              Live_Security_Audit_Feed
            </span>
          </div>
          <span className="text-[10px] text-on-surface-variant opacity-40 uppercase tracking-widest font-bold">
            Personnel: {member.id} - active stream
          </span>
        </div>
        <div className="space-y-3 opacity-90 relative z-10">
          <p className="flex items-start md:items-center">
            <span className="text-primary w-24 flex-shrink-0">[14:22:01]</span>{' '}
            <span className="text-white/80">
              <span className="text-primary font-bold uppercase mr-2">VERIFIED</span> Internal API Key invoked gateway flow
            </span>
          </p>
          <p className="flex items-start md:items-center">
            <span className="text-primary w-24 flex-shrink-0">[14:18:44]</span>{' '}
            <span className="text-white/80">
              <span className="text-primary font-bold uppercase mr-2">VERIFIED</span> Cluster assignment synchronized from Vault metadata
            </span>
          </p>
          <p className="flex items-start md:items-center">
            <span className="text-primary w-24 flex-shrink-0">[14:15:12]</span>{' '}
            <span className="text-on-surface-variant">
              <span className="text-secondary font-bold uppercase mr-2">SYSTEM_LOG</span> Policy update detected for this member profile
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

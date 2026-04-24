/* eslint-disable react/react-in-jsx-scope */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  BadgeCheck, ChevronLeft, CircleX, Cloud, Cpu, Lock,
  History, UserCog, Users, UserPlus, UserMinus, Settings2, Terminal,
  KeyRound, X, Info, Calendar, Copy, Check, AlertTriangle, ShieldAlert,
  Plus,
} from 'lucide-react';
import { BarChart, Bar, Cell, ResponsiveContainer } from 'recharts';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { ErrorPanel } from '@/components/ui/RequestState';
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

interface AuditEntry {
  date: string;
  action: string;
  actor: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
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
      getEnvelope<EffectivePolicy>(`/policies/resolve`, { userId: id }).catch(() => null),
    enabled: !!id,
  });
}

const getFutureDate = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
};

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
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isKeyFlowOpen, setIsKeyFlowOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expMonths, setExpMonths] = useState<number>(1);
  const [auditTab, setAuditTab] = useState<'PERSONAL' | 'TEAM'>('PERSONAL');

  const assignPerSeatKey = useMutation({
    mutationFn: () => postEnvelope(`/users/${id}/provider-keys/assign`, { provider, apiKey }),
    onSuccess: () => {
      const newKey = `aihub_${provider.toLowerCase()}_${Math.random().toString(36).substring(2, 10)}`;
      setGeneratedKey(newKey);
      setApiKey('');
      setIsAssignModalOpen(false);
      setIsKeyFlowOpen(true);
      qc.invalidateQueries({ queryKey: ['members', id] });
      setMutationError(null);
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to assign provider key.');
    },
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalCost = (usageRows ?? []).reduce((sum, r) => sum + r.costUsd, 0);
  const totalTokens = (usageRows ?? []).reduce((sum, r) => sum + r.totalTokens, 0);
  const totalRequests = (usageRows ?? []).reduce((sum, r) => sum + r.requestCount, 0);

  const chartData = useMemo(
    () => (usageRows ?? []).map((r) => ({ day: r.date.slice(-2), val: r.requestCount })),
    [usageRows],
  );

  const localAuditTrail: AuditEntry[] = [
    { date: '2024-04-22 10:15:30', action: 'POLICY_ATTACH', actor: 'Admin', desc: 'Attached [Standard_Ops] protocol overlay', icon: BadgeCheck, color: 'text-primary' },
    { date: '2024-04-21 09:44:12', action: 'KEY_ROTATE', actor: 'SYSTEM_DAEMON', desc: 'Automatic rotation of secondary operational key', icon: KeyRound, color: 'text-primary' },
    { date: '2024-04-19 16:20:05', action: 'ACCESS_GRANT', actor: 'Admin', desc: 'Granted seat assignment for provider cluster', icon: Cloud, color: 'text-primary' },
    { date: '2024-04-15 11:30:55', action: 'SIGNAL_MOD', actor: 'System', desc: 'Modified signal intensity threshold (+15%)', icon: Terminal, color: 'text-primary' },
    { date: '2024-04-10 08:00:00', action: 'MEMBER_JOIN', actor: 'SYSTEM_DAEMON', desc: 'Initial neural handshake established', icon: UserCog, color: 'text-primary' },
  ];

  const teamAuditTrail: AuditEntry[] = [
    { date: '2024-04-23 14:05:22', action: 'TEAM_POLICY_UPDATE', actor: 'Admin', desc: 'Updated collective throughput quota', icon: Settings2, color: 'text-primary' },
    { date: '2024-04-22 11:30:10', action: 'MEMBER_ADDED', actor: 'Admin', desc: 'Integrated new member into cluster', icon: UserPlus, color: 'text-primary' },
    { date: '2024-04-20 15:45:00', action: 'RESOURCE_ALLOC', actor: 'SYSTEM_DAEMON', desc: 'Auto-scaled cluster allocation (+3 units)', icon: Cpu, color: 'text-primary' },
    { date: '2024-04-18 09:12:33', action: 'MEMBER_REMOVED', actor: 'Admin', desc: 'Severed neural link for decommissioned member', icon: UserMinus, color: 'text-error' },
    { date: '2024-04-12 16:20:15', action: 'TEAM_QUOTA_RESET', actor: 'SYSTEM_DAEMON', desc: 'Monthly data transmission bucket reset', icon: History, color: 'text-primary' },
  ];

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <TableSkeleton rows={3} cols={3} />
      </div>
    );
  }

  if (!member) return null;

  const primaryTeam = member.teamMembers[0];

  return (
    <div className="space-y-8 pb-12 overflow-hidden">
      <Link
        to="/members"
        className="flex items-center text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-all"
      >
        <ChevronLeft className="w-4 h-4 mr-2" /> Return to Fleet Registry
      </Link>

      {/* Primary Header Card */}
      <section className="glass-panel p-10 rounded-3xl border border-white/10 relative overflow-hidden">
        <div className="flex flex-col md:flex-row gap-10 items-start relative z-10">
          <div className="flex-shrink-0">
            <div className="w-24 h-24 rounded-2xl bg-surface border border-white/10 flex items-center justify-center font-black text-4xl text-on-surface shadow-2xl uppercase">
              {member.fullName.charAt(0)}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-5xl font-black tracking-tighter text-on-surface uppercase">{member.fullName}</h2>
              <StatusBadge status={member.status} />
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-primary font-bold uppercase tracking-widest">
              <span>SIGNAL: {member.id}</span>
              <span className="opacity-40">-</span>
              <span>DEPT: {primaryTeam?.team.name ?? 'UNASSIGNED'}</span>
            </div>
            <div className="max-w-2xl">
              <p className="text-sm text-on-surface-variant font-bold uppercase tracking-widest leading-relaxed opacity-60">
                OVERSEEING HIGH-LATENCY NEURAL STREAMS. ACCESS LEVEL AND POLICY OVERLAYS ARE SYNCHRONIZED FROM BACKEND RESOLUTION.
              </p>
            </div>
          </div>
          <div className="md:text-right self-end">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-40">
              KEY REVOKE/ROTATE ACTION IS MANAGED IN KEY LIFECYCLE MODULE
            </p>
          </div>
        </div>
      </section>

      {(memberQuery.isError || usageQuery.isError) && (
        <ErrorPanel message="Failed to load member details." onRetry={() => { memberQuery.refetch(); usageQuery.refetch(); }} />
      )}
      {mutationError && <ErrorPanel message={mutationError} onRetry={() => setMutationError(null)} />}

      {/* Signal Intensity + Active Protocols */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 glass-panel p-10 rounded-3xl relative overflow-hidden bg-[#0a0a0a]/40 group min-h-[400px] flex flex-col">
          <div className="flex justify-between items-start mb-10">
            <h3 className="text-xl font-bold uppercase tracking-widest">SIGNAL INTENSITY</h3>
            <div className="text-right">
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">LIVE TELEMETRY</p>
              <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest opacity-40">
                FLUX VOL: {formatNumber(totalTokens)} DELTA
              </p>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center space-y-6">
            {usageLoading ? (
              <div className="h-48 w-full bg-white/5 animate-pulse rounded-xl" />
            ) : chartData.length === 0 ? (
              <div className="text-center opacity-30">
                <p className="text-sm font-bold uppercase tracking-[0.4em]">No usage data</p>
              </div>
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <Bar dataKey="val">
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill="#38bdf8" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40 border border-white/5 space-y-10">
          <h3 className="text-xl font-bold uppercase tracking-widest">ACTIVE PROTOCOLS</h3>
          <div className="space-y-10">
            <div className="flex items-start gap-4">
              <BadgeCheck className="text-primary w-6 h-6 mt-1" />
              <div>
                <p className="text-xs font-black text-on-surface uppercase tracking-widest">FLOW RATE</p>
                <p className="text-sm text-primary font-mono mt-1 font-bold">{formatNumber(totalRequests)} Req</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <Lock className="text-primary w-6 h-6 mt-1" />
              <div>
                <p className="text-xs font-black text-on-surface uppercase tracking-widest">DAILY QUOTA</p>
                <p className="text-sm text-primary font-mono mt-1 font-bold uppercase tracking-tighter">
                  {policy?.limits?.dailyTokens ? formatNumber(policy.limits.dailyTokens) : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <Cpu className="text-primary w-6 h-6 mt-1" />
              <div>
                <p className="text-xs font-black text-on-surface uppercase tracking-widest">AUTHORIZED CORES</p>
                <p className="text-[10px] text-on-surface-variant mt-2 font-bold uppercase tracking-[0.2em] leading-relaxed opacity-60">
                  {policy?.allowedEngines?.length ? policy.allowedEngines.join(', ') : 'ALL ENGINES'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Spend (30d)" value={formatUsd(totalCost)} />
        <StatCard label="Requests (30d)" value={formatNumber(totalRequests)} />
        <StatCard label="Tokens (30d)" value={formatNumber(totalTokens)} />
        <StatCard
          label="Team / Tier"
          value={primaryTeam ? `${primaryTeam.team.name} · ${primaryTeam.tier.toLowerCase()}` : '—'}
        />
      </div>

      {/* Operational Keys + Assigned Clusters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-6 glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40 group flex flex-col">
          <div className="flex justify-between items-center mb-12">
            <h3 className="text-xl font-bold uppercase tracking-widest">OPERATIONAL KEYS</h3>
            <span className="text-[9px] font-mono text-primary font-black uppercase tracking-[0.3em] bg-primary/10 px-3 py-1 rounded-md border border-primary/20">
              {(member.apiKeys ?? []).length} ACTIVE STREAMS
            </span>
          </div>
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-4 text-[9px] font-black text-on-surface-variant uppercase tracking-[0.4em] opacity-40 mb-6 px-2">
              <span>DESIGNATION</span>
              <span>CALIBRATED</span>
              <span>STATUS</span>
              <span className="text-right">OPS</span>
            </div>
            {(member.apiKeys ?? []).length === 0 ? (
              <div className="flex-1 min-h-[160px] flex items-center justify-center border border-white/5 bg-white/5 rounded-2xl border-dashed">
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-[0.4em] opacity-30">NO ACTIVE OPERATIONAL KEYS</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(member.apiKeys ?? []).map((key) => (
                  <div key={key.id} className="grid grid-cols-4 items-center px-2 py-3 hover:bg-white/5 rounded-xl transition-all group/row">
                    <span className="font-mono text-[10px] text-primary font-bold group-hover/row:translate-x-1 transition-transform">{key.keyPrefix}</span>
                    <span className="text-[9px] text-on-surface-variant opacity-60 font-mono">{formatDate(key.createdAt)}</span>
                    <StatusBadge status={key.status} />
                    <span className="text-right text-[9px] text-on-surface-variant opacity-40 uppercase tracking-widest font-black">Managed</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40 border border-white/5">
          <div className="flex justify-between items-center mb-12">
            <h3 className="text-xl font-bold uppercase tracking-widest">ASSIGNED CLUSTERS</h3>
            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-40">PROVIDER KEY ASSIGNMENT</span>
          </div>
          <div className="space-y-6">
            {(member.providerKeys ?? []).map((pk, idx) => (
              <div key={idx} className="p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all border-l-4 border-primary">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-[#111111] border border-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                    <Cloud className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-on-surface uppercase tracking-tight">{pk.provider}</h4>
                    <p className="text-[10px] font-mono text-primary font-medium mt-1 leading-tight max-w-[200px] break-all opacity-70">{pk.vaultPath}</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-3">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">{pk.scope}</span>
                  <CircleX className="w-5 h-5 text-on-surface-variant cursor-pointer hover:text-error transition-all" />
                </div>
              </div>
            ))}

            {(member.providerKeys ?? []).length === 0 && (
              <div className="p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between group hover:bg-white/10 transition-all border-l-4 border-primary">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-[#111111] border border-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                    <Cloud className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-on-surface uppercase tracking-tight">Shared-Cluster</h4>
                    <p className="text-[10px] font-mono text-primary font-medium mt-1 opacity-70">No cluster linked</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-3">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">OVERSIGHT_TIER</span>
                  <CircleX className="w-5 h-5 text-on-surface-variant opacity-40" />
                </div>
              </div>
            )}

            {canUseCapability(role, 'member.assignProviderKey') && (
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="w-full p-10 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-6 group hover:bg-white/5 hover:border-primary/30 transition-all cursor-pointer bg-transparent"
              >
                <div className="w-12 h-12 rounded-full border-2 border-on-surface-variant/40 flex items-center justify-center group-hover:border-primary/60 transition-all text-on-surface-variant/60 group-hover:text-primary">
                  <Plus className="w-6 h-6" />
                </div>
                <p className="text-xs font-black text-on-surface-variant uppercase tracking-[0.4em] group-hover:text-on-surface transition-all">ASSIGN PROVIDER KEY</p>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Effective Policy + System API Keys + Provider Keys */}
      <div className="space-y-6">
        <div className="glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40">
          <h4 className="text-sm font-black text-on-surface uppercase tracking-widest mb-4">Effective Policy</h4>
          {policy ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {policy.allowedEngines.map((e, i) => (
                  <div key={i} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface">{e}</span>
                  </div>
                ))}
              </div>
              {policy.limits?.monthlyBudgetUsd && (
                <p className="text-xs font-bold text-primary font-mono mt-2">Monthly Budget: {formatUsd(policy.limits.monthlyBudgetUsd)}</p>
              )}
            </div>
          ) : (
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest opacity-60 italic">No active policy</p>
          )}
        </div>

        <div className="glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40 space-y-6">
          <h4 className="text-sm font-black text-on-surface uppercase tracking-widest opacity-80">System API Keys</h4>
          {(member.apiKeys ?? []).length === 0 ? (
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest opacity-60 italic">No system keys issued</p>
          ) : (
            <div className="space-y-4">
              {(member.apiKeys ?? []).map((key) => (
                <div key={key.id} className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
                  <div>
                    <p className="text-xs font-mono text-primary font-bold">{key.keyPrefix}</p>
                    <p className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest mt-1 opacity-60">
                      Status: {key.status} // Last Used: {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                    </p>
                  </div>
                  <KeyRound className="w-4 h-4 text-primary opacity-40" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40">
          <h4 className="text-sm font-black text-on-surface uppercase tracking-widest mb-8">Provider Keys (PER_SEAT)</h4>
          {(member.providerKeys ?? []).length > 0 ? (
            <div className="space-y-4">
              {member.providerKeys?.map((k) => (
                <div key={`${k.provider}-${k.vaultPath}`} className="p-6 bg-white/5 rounded-2xl flex justify-between items-start">
                  <div>
                    <p className="text-xs font-black text-on-surface uppercase tracking-widest mb-2">{k.provider}</p>
                    <p className="text-[10px] font-mono text-on-surface-variant opacity-60 tracking-tighter break-all max-w-xl">{k.vaultPath}</p>
                  </div>
                  <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-40">{k.scope}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 bg-white/5 rounded-2xl flex justify-between items-start">
              <div>
                <p className="text-xs font-black text-on-surface uppercase tracking-widest mb-2">OPENAI</p>
                <p className="text-[10px] font-mono text-on-surface-variant opacity-60 tracking-tighter break-all max-w-xl">
                  kv/aihub/providers/openai/users/{member.id.toLowerCase()}
                </p>
              </div>
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-40">PER_SEAT</span>
            </div>
          )}
        </div>
      </div>

      {/* Historical Audit Trail */}
      <section className="glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40 border border-white/5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div className="flex items-center gap-3">
            <History className="text-primary w-5 h-5 flex-shrink-0" />
            <h3 className="text-xl font-bold uppercase tracking-widest">Historical Audit Trail</h3>
          </div>
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => setAuditTab('PERSONAL')}
              className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all flex items-center gap-2 ${auditTab === 'PERSONAL' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:bg-white/5'}`}
            >
              <UserCog className="w-3 h-3" /> Personal
            </button>
            <button
              onClick={() => setAuditTab('TEAM')}
              className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all flex items-center gap-2 ${auditTab === 'TEAM' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:bg-white/5'}`}
            >
              <Users className="w-3 h-3" /> Team Actions
            </button>
          </div>
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-40">
            Archive_Stream // {auditTab === 'PERSONAL' ? `Subject: ${member.fullName}` : `Unit: ${primaryTeam?.team.name ?? 'N/A'}`}
          </p>
        </div>
        <div className="space-y-4 overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.3em] opacity-40 border-b border-white/5">
                <th className="pb-4">Timestamp</th>
                <th className="pb-4">Event_Type</th>
                <th className="pb-4">Operation_Designation</th>
                <th className="pb-4 text-right">Executor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(auditTab === 'PERSONAL' ? localAuditTrail : teamAuditTrail).map((log, i) => {
                const Icon = log.icon;
                return (
                  <motion.tr
                    key={`${auditTab}-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-white/5 transition-all"
                  >
                    <td className="py-5 text-[10px] font-mono text-on-surface-variant opacity-60 font-bold">{log.date}</td>
                    <td className="py-5">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${log.color} opacity-70`} />
                        <span className={`text-[9px] font-black uppercase tracking-widest ${log.color}`}>{log.action}</span>
                      </div>
                    </td>
                    <td className="py-5">
                      <p className="text-xs font-bold text-on-surface uppercase tracking-tight opacity-80">{log.desc}</p>
                    </td>
                    <td className="py-5 text-right">
                      <span className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest opacity-60">{log.actor}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="pt-6 flex justify-center">
            <button className="text-[10px] font-black text-primary/40 uppercase tracking-[0.4em] hover:text-primary transition-all">
              Retrieve Extended Archive Records ↓
            </button>
          </div>
        </div>
      </section>

      {/* Live Security Audit Feed */}
      <section className="glass-panel p-8 rounded-3xl border-transparent font-mono text-[11px] overflow-hidden relative">
        <div className="absolute inset-0 bg-primary/5 pointer-events-none opacity-20"></div>
        <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary status-glow animate-pulse"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">LIVE_SECURITY_AUDIT_FEED</span>
          </div>
          <span className="text-[10px] text-on-surface-variant opacity-40 uppercase tracking-widest font-bold">
            PERSONNEL: {member.id} - ACTIVE STREAM
          </span>
        </div>
        <div className="space-y-6 relative z-10 pl-2">
          <div className="flex gap-10 group/log">
            <span className="text-primary font-bold opacity-60 w-24 flex-shrink-0">[14:22:01]</span>
            <div className="flex gap-4">
              <span className="text-primary font-black uppercase w-20">VERIFIED</span>
              <p className="text-on-surface/80 tracking-tight">Internal API Key invoked gateway flow</p>
            </div>
          </div>
          <div className="flex gap-10 group/log">
            <span className="text-primary font-bold opacity-60 w-24 flex-shrink-0">[14:18:44]</span>
            <div className="flex gap-4">
              <span className="text-primary font-black uppercase w-20">VERIFIED</span>
              <p className="text-on-surface/80 tracking-tight">Cluster assignment synchronized from Vault metadata</p>
            </div>
          </div>
          <div className="flex gap-10 group/log">
            <span className="text-primary font-bold opacity-60 w-24 flex-shrink-0">[14:15:12]</span>
            <div className="flex gap-4">
              <span className="text-on-surface-variant font-black uppercase w-20">SYSTEM_LOG</span>
              <p className="text-on-surface-variant/80 tracking-tight">Policy update detected for this member profile</p>
            </div>
          </div>
        </div>
      </section>

      {/* Assign Provider Modal */}
      <AnimatePresence>
        {isAssignModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAssignModalOpen(false)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl glass-panel p-8 rounded-3xl border-primary/20 accent-border shadow-2xl"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">Assign Provider Key</h2>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-1 italic">Policy-Driven Cluster Integration</p>
                </div>
                <button onClick={() => setIsAssignModalOpen(false)} className="text-on-surface-variant hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50 ml-1">AI Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as 'ANTHROPIC' | 'OPENAI' | 'GOOGLE')}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 focus:ring-0 transition-all appearance-none cursor-pointer"
                    >
                      <option className="bg-surface" value="OPENAI">OpenAI</option>
                      <option className="bg-surface" value="ANTHROPIC">Anthropic</option>
                      <option className="bg-surface" value="GOOGLE">Google</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50 ml-1 flex items-center gap-2">
                      Applied Policy <Info className="w-3 h-3 text-primary opacity-60" />
                    </label>
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-[10px] font-black text-primary uppercase tracking-widest">
                      [Standard_Ops]
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50 ml-1">Provider API Key</label>
                  <input
                    type="password"
                    placeholder="Paste seat API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono focus:border-primary/40 focus:ring-0 transition-all"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface">System Key Expiration</h4>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ label: '1 Month', val: 1 }, { label: '3 Months', val: 3 }, { label: '6 Months', val: 6 }, { label: '1 Year', val: 12 }].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setExpMonths(opt.val)}
                        className={`py-2.5 border rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${expMonths === opt.val ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 hover:border-primary/40'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] font-mono text-on-surface-variant opacity-40 ml-1">
                    Expires: {getFutureDate(expMonths)}
                  </p>
                </div>

                <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl flex gap-4">
                  <ShieldAlert className="text-primary w-6 h-6 flex-shrink-0" />
                  <p className="text-[11px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-wide">
                    System will generate a unique internal hash linked to the provider key. This hash must be used by the member to authorize against internal nodes.
                  </p>
                </div>

                <button
                  onClick={() => assignPerSeatKey.mutate()}
                  disabled={!apiKey.trim() || assignPerSeatKey.isPending}
                  className="w-full py-5 bg-primary text-on-primary font-black text-[12px] uppercase tracking-[0.3em] rounded-xl shadow-xl hover:brightness-110 active:scale-[0.98] transition-all status-glow mt-4 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <KeyRound className="w-4 h-4" /> {assignPerSeatKey.isPending ? 'Processing...' : 'Finalize & Issue Key'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Key Hash Issued Modal */}
      <AnimatePresence>
        {isKeyFlowOpen && generatedKey && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-panel p-10 rounded-[2.5rem] border-primary/30 accent-border shadow-[0_0_50px_rgba(56,189,248,0.2)]"
            >
              <div className="text-center space-y-8">
                <div className="w-20 h-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto border border-primary/20 shadow-inner">
                  <KeyRound className="w-10 h-10 status-glow" />
                </div>
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight">System Hash Issued</h2>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mt-2 italic">Protocol Authorization Established</p>
                </div>
                <div className="p-6 bg-error/10 border border-error/30 rounded-3xl flex gap-4 text-left">
                  <AlertTriangle className="text-error w-8 h-8 flex-shrink-0 animate-pulse" />
                  <div>
                    <p className="text-[11px] font-black text-error leading-relaxed uppercase tracking-tight">Critical: Visibility Constraint</p>
                    <p className="text-[10px] font-bold text-on-surface-variant opacity-80 mt-1 uppercase leading-tight tracking-wide">
                      This secret hash will NEVER be shown again in full. Copy it now and provide it to the member immediately.
                    </p>
                  </div>
                </div>
                <div className="relative group">
                  <div className="w-full bg-surface border-2 border-primary/10 rounded-3xl p-8 pr-20 break-all font-mono text-base text-primary font-black shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                    {generatedKey}
                  </div>
                  <button
                    onClick={() => handleCopy(generatedKey)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-primary text-on-primary rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all status-glow"
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <button
                  onClick={() => setIsKeyFlowOpen(false)}
                  className="w-full py-5 bg-white/5 border border-white/10 text-on-surface font-black text-[11px] uppercase tracking-[0.4em] rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 group"
                >
                  <BadgeCheck className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-all" /> I HAVE SECURED THE HASH
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, Shield, Users, Plus, Trash2, Info,
  Target, ArrowRightLeft, AlertCircle, CheckCircle2, X,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { useAuth } from '@/contexts/AuthContext';
import { formatUsd } from '@/lib/utils';
import { canUseCapability } from '@/lib/capabilities';
import { monthToDateRange } from '@/lib/date-range';
import { deleteEnvelope, getEnvelope, postEnvelope, putEnvelope } from '@/lib/api';

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

interface ApiPolicy {
  id: string;
  name?: string;
  teamId?: string | null;
  userId?: string | null;
  tier?: string | null;
  priority?: number;
  isActive?: boolean;
  allowedEngines?: string[];
  config?: {
    limits?: { rpm?: number; dailyTokens?: number; monthlyBudgetUsd?: number };
    fallback?: { enabled?: boolean; thresholdPct?: number; fromModel?: string; toModel?: string };
  };
}

interface Policy {
  id: string;
  name: string;
  scope: 'ORG' | 'TEAM' | 'ROLE' | 'USER';
  target: string;
  priority: number;
  active: boolean;
  allowedModels: string[];
  limits: { rpm: number; dailyTokens: number; monthlyBudget: number };
  fallback: { enabled: boolean; threshold: number; fromModel: string; toModel: string };
}

function mapApiPolicy(p: ApiPolicy): Policy {
  const scope: Policy['scope'] = p.userId ? 'USER' : p.teamId && p.tier ? 'ROLE' : p.teamId ? 'TEAM' : 'ORG';
  return {
    id: p.id,
    name: p.name ?? 'Untitled',
    scope,
    target: p.userId ?? p.teamId ?? 'Global',
    priority: p.priority ?? 0,
    active: p.isActive ?? true,
    allowedModels: p.allowedEngines ?? [],
    limits: {
      rpm: p.config?.limits?.rpm ?? 60,
      dailyTokens: p.config?.limits?.dailyTokens ?? 250000,
      monthlyBudget: p.config?.limits?.monthlyBudgetUsd ?? 500,
    },
    fallback: {
      enabled: p.config?.fallback?.enabled ?? false,
      threshold: p.config?.fallback?.thresholdPct ?? 80,
      fromModel: p.config?.fallback?.fromModel ?? '',
      toModel: p.config?.fallback?.toModel ?? '',
    },
  };
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

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { isAdmin, isTeamLead } = useAuth();
  const role = { isAdmin, isTeamLead };
  const teamQuery = useTeamDetail(id!);
  const usageQuery = useTeamUsage(id!);
  const team = teamQuery.data;
  const usageRows = usageQuery.data;

  useEffect(() => {
    if (team) setBudgetInput(String(team.monthlyBudgetUsd ?? ''));
  }, [team?.id, team?.monthlyBudgetUsd]);

  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberTier, setNewMemberTier] = useState<'MEMBER' | 'SENIOR' | 'LEAD'>('MEMBER');
  const [budgetInput, setBudgetInput] = useState('');
  const [tierTarget, setTierTarget] = useState<{ userId: string; tier: 'MEMBER' | 'SENIOR' | 'LEAD' } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);

  const teamPoliciesQuery = useQuery<Policy[]>({
    queryKey: ['teams', id, 'policies'],
    queryFn: async () => {
      const raw = await getEnvelope<ApiPolicy[]>(`/teams/${id}/policies`);
      return (raw ?? []).map(mapApiPolicy);
    },
    enabled: !!id,
  });

  const effectivePolicyQuery = useQuery<Policy | null>({
    queryKey: ['teams', id, 'policies', 'effective'],
    queryFn: async () => {
      const raw = await getEnvelope<ApiPolicy | null>(`/teams/${id}/policies/effective`);
      return raw ? mapApiPolicy(raw) : null;
    },
    enabled: !!id,
  });

  const allPoliciesQuery = useQuery<Policy[]>({
    queryKey: ['policies', 'all'],
    queryFn: async () => {
      const raw = await getEnvelope<ApiPolicy[]>('/policies', { limit: 100 });
      return (raw ?? []).map(mapApiPolicy);
    },
    enabled: isAttachModalOpen,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => deleteEnvelope(`/teams/${id}/members/${userId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams', id] }); setRemoveTarget(null); setMutationError(null); },
    onError: (error) => { setMutationError(error instanceof Error ? error.message : 'Failed to remove member.'); },
  });

  const addMember = useMutation({
    mutationFn: () => postEnvelope(`/teams/${id}/members`, { userId: newMemberId.trim(), tier: newMemberTier }),
    onSuccess: () => { setNewMemberId(''); qc.invalidateQueries({ queryKey: ['teams', id] }); setMutationError(null); },
    onError: (error) => { setMutationError(error instanceof Error ? error.message : 'Failed to add member.'); },
  });

  const updateBudget = useMutation({
    mutationFn: () => putEnvelope(`/teams/${id}`, { monthlyBudgetUsd: Number(budgetInput) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', id] });
      setMutationError(null);
    },
    onError: (error) => { setMutationError(error instanceof Error ? error.message : 'Failed to update budget.'); },
  });

  const changeTier = useMutation({
    mutationFn: ({ userId, tier }: { userId: string; tier: 'MEMBER' | 'SENIOR' | 'LEAD' }) =>
      putEnvelope(`/teams/${id}/members/${userId}/tier`, { tier }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams', id] }); setTierTarget(null); setMutationError(null); },
    onError: (error) => { setMutationError(error instanceof Error ? error.message : 'Failed to change member tier.'); },
  });

  const attachPolicy = useMutation({
    mutationFn: (policyId: string) => postEnvelope(`/teams/${id}/policies/${policyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', id, 'policies'] });
      qc.invalidateQueries({ queryKey: ['teams', id, 'policies', 'effective'] });
      setIsAttachModalOpen(false);
      setMutationError(null);
    },
    onError: (error) => { setMutationError(error instanceof Error ? error.message : 'Failed to attach policy.'); },
  });

  const detachPolicy = useMutation({
    mutationFn: (policyId: string) => deleteEnvelope(`/teams/${id}/policies/${policyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams', id, 'policies'] });
      qc.invalidateQueries({ queryKey: ['teams', id, 'policies', 'effective'] });
      setMutationError(null);
    },
    onError: (error) => { setMutationError(error instanceof Error ? error.message : 'Failed to detach policy.'); },
  });

  const totalCost = (usageRows ?? []).reduce((sum, r) => sum + r.costUsd, 0);
  const attachedPolicies = teamPoliciesQuery.data ?? [];
  const effectivePolicy = effectivePolicyQuery.data ?? null;

  if (teamQuery.isLoading) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <TableSkeleton rows={5} cols={4} />
      </div>
    );
  }

  if (!team) return null;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <Link
          to="/teams"
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-all group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Return to Manifest
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40 italic">Audit Node // Signal-42</span>
          <div className="w-8 h-px bg-white/10" />
        </div>
      </div>

      {(teamQuery.isError || usageQuery.isError) && (
        <ErrorPanel message="Failed to load team data." onRetry={() => { teamQuery.refetch(); usageQuery.refetch(); }} />
      )}
      {mutationError && <ErrorPanel message={mutationError} onRetry={() => setMutationError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">

          {/* Header Card */}
          <div className="glass-panel p-8 rounded-3xl border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <Users className="w-48 h-48 text-primary" />
            </div>
            <div className="relative z-10">
              <div className="flex gap-6 items-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-surface border border-white/10 flex items-center justify-center font-black text-2xl text-primary status-glow">
                  {team.name[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="text-4xl font-black text-on-surface tracking-tighter uppercase">{team.name}</h2>
                  <p className="text-[10px] font-mono text-primary uppercase tracking-[0.3em] mt-1 italic">
                    Unit ID: {team.id}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 px-1">
                <div className="space-y-1">
                  <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">Resolved Policy</p>
                  <p className="text-xs font-bold text-on-surface truncate uppercase tracking-tight">{effectivePolicy?.name || 'NONE'}</p>
                </div>
                <div className="space-y-1 border-l border-white/10 pl-6">
                  <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">Status</p>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary status-glow" />
                    <p className="text-xs font-bold text-on-surface uppercase tracking-tight">Active Reach</p>
                  </div>
                </div>
                <div className="space-y-1 border-l border-white/10 pl-6 text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">Monthly Spend</p>
                  <p className="text-xs font-mono font-bold text-primary">{formatUsd(totalCost)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Effective Protocol Analysis */}
          <div className="glass-panel p-1 border-primary/20 rounded-3xl bg-primary/5 overflow-hidden shadow-[0_0_20px_rgba(56,189,248,0.05)]">
            <div className="p-8 space-y-8">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-black uppercase tracking-tight">Effective Protocol Analysis</h3>
                </div>
                <div className="px-3 py-1 bg-primary text-on-primary rounded font-black text-[9px] uppercase tracking-widest shadow-lg">
                  FINAL RESOLUTION
                </div>
              </div>
              {effectivePolicy ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Authorized Engines</p>
                      <div className="flex flex-wrap gap-2">
                        {effectivePolicy.allowedModels.map((m, i) => (
                          <div key={i} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface">{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Resource Limitations</p>
                      <div className="grid grid-cols-1 gap-2 font-mono">
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                          <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Signal Rate</span>
                          <span className="text-xs font-bold text-primary">{effectivePolicy.limits.rpm} RPM</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                          <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Daily Energy</span>
                          <span className="text-xs font-bold text-primary">{effectivePolicy.limits.dailyTokens.toLocaleString()} TOKENS</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                          <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Finance Cap</span>
                          <span className="text-xs font-bold text-primary">${effectivePolicy.limits.monthlyBudget.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-white/10">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60 mb-4">Failover Intelligence</p>
                    <div className="glass-panel p-6 rounded-2xl flex items-center justify-between border-dashed">
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-40">Anchor</p>
                          <p className="text-[10px] font-bold uppercase text-on-surface">{effectivePolicy.fallback.fromModel || 'NONE'}</p>
                        </div>
                        <ArrowRightLeft className="w-4 h-4 text-primary opacity-30" />
                        <div className="text-center">
                          <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-40">Failover</p>
                          <p className="text-[10px] font-bold uppercase text-primary">{effectivePolicy.fallback.toModel || 'NONE'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest mb-1 opacity-40">Threshold</p>
                        <p className="text-[10px] font-mono font-bold text-on-surface">{effectivePolicy.fallback.threshold}% UTIL</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-on-surface-variant opacity-40">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em]">No protocols actively bound to this signal</p>
                </div>
              )}
            </div>
          </div>

          {/* Team Member Manifest */}
          <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-black uppercase tracking-tight">Team Member Manifest</h3>
              </div>
              <div className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-40">
                Personnel Inventory // Count: {team.members.length}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.3em] opacity-40 border-b border-white/5">
                    <th className="pb-4">Member_Signal</th>
                    <th className="pb-4">Tier</th>
                    <th className="pb-4">Status</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {team.members.map((m) => (
                    <tr key={m.userId} className="group hover:bg-white/5 transition-all">
                      <td className="py-5">
                        <p className="text-xs font-black text-on-surface uppercase tracking-tight">{m.user.fullName}</p>
                        <p className="text-[8px] font-mono text-primary uppercase mt-0.5 opacity-60">{m.user.email}</p>
                      </td>
                      <td className="py-5">
                        <span className="text-[10px] font-bold text-on-surface uppercase tracking-widest">{m.tier}</span>
                      </td>
                      <td className="py-5">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${m.user.status === 'ACTIVE' ? 'bg-primary animate-pulse' : 'bg-on-surface-variant/40'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${m.user.status === 'ACTIVE' ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                            {m.user.status}
                          </span>
                        </div>
                      </td>
                      <td className="py-5 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          {canUseCapability(role, 'teams.changeTier') && (
                            <button
                              type="button"
                              onClick={() => setTierTarget({ userId: m.userId, tier: m.tier as 'MEMBER' | 'SENIOR' | 'LEAD' })}
                              className="px-3 py-1.5 bg-white/5 hover:bg-primary/20 text-on-surface-variant hover:text-primary rounded-xl transition-all text-[9px] font-black uppercase tracking-widest"
                            >
                              Tier
                            </button>
                          )}
                          {canUseCapability(role, 'teams.removeMember') && (
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(m.userId)}
                              className="p-1.5 bg-white/5 hover:bg-error/20 text-on-surface-variant hover:text-error rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {team.members.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10">
                        <EmptyState message="No members in this team" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {canUseCapability(role, 'teams.addMember') && (
              <div className="pt-6 border-t border-white/10">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50 mb-4">Recruit Personnel</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                    placeholder="User ID"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 focus:ring-0 transition-all"
                  />
                  <select
                    value={newMemberTier}
                    onChange={(e) => setNewMemberTier(e.target.value as 'MEMBER' | 'SENIOR' | 'LEAD')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 focus:ring-0 transition-all appearance-none"
                  >
                    <option value="MEMBER" className="bg-surface">MEMBER</option>
                    <option value="SENIOR" className="bg-surface">SENIOR</option>
                    <option value="LEAD" className="bg-surface">LEAD</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => addMember.mutate()}
                    disabled={!newMemberId.trim() || addMember.isPending}
                    className="py-3 bg-primary text-on-primary font-black text-[11px] uppercase tracking-[0.3em] rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addMember.isPending ? 'Recruiting...' : 'Recruit Personnel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Bound Protocols */}
          <div className="glass-panel p-8 rounded-3xl space-y-8">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tight">Bound Protocols</h3>
              <button
                onClick={() => setIsAttachModalOpen(true)}
                className="p-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {attachedPolicies.map((p) => (
                <div key={p.id} className="group p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-primary/40 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-[10px] font-black text-on-surface uppercase tracking-tight">{p.name}</p>
                      <p className="text-[8px] font-mono text-primary uppercase mt-0.5 opacity-60">PRIORITY: {p.priority}</p>
                    </div>
                    <button onClick={() => detachPolicy.mutate(p.id)} className="p-1.5 text-on-surface-variant hover:text-error transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <Target className="w-3 h-3 text-on-surface-variant opacity-40" />
                      <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">{p.scope}: {p.target}</span>
                    </div>
                    <button
                      onClick={() => detachPolicy.mutate(p.id)}
                      className="text-[8px] font-black uppercase tracking-widest text-error opacity-0 group-hover:opacity-100 transition-all hover:underline"
                    >
                      DETACH
                    </button>
                  </div>
                </div>
              ))}
              {attachedPolicies.length === 0 && (
                <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-40 text-center py-4">
                  No bound protocols identified
                </p>
              )}
            </div>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex gap-3">
              <Info className="text-primary w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed">
                Multi-policy environment. The directive with the{' '}
                <span className="text-primary">highest priority integer</span> overrides sub-policies.
              </p>
            </div>
          </div>

          {/* Budget Control */}
          {canUseCapability(role, 'teams.updateBudget') && (
            <div className="glass-panel p-8 rounded-3xl space-y-6">
              <h3 className="text-xl font-black uppercase tracking-tight">Budget Control</h3>
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60">Monthly Cap</p>
                <p className="text-2xl font-black text-primary font-mono">{formatUsd(team.monthlyBudgetUsd ?? 0)}</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="USD amount"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold focus:border-primary/40 focus:ring-0 transition-all"
                />
                <button
                  type="button"
                  onClick={() => updateBudget.mutate()}
                  disabled={!budgetInput || updateBudget.isPending}
                  className="px-4 py-3 bg-primary text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl disabled:opacity-50 hover:brightness-110 active:scale-95 transition-all"
                >
                  {updateBudget.isPending ? '...' : 'Set'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attach Protocol Modal */}
      <AnimatePresence>
        {isAttachModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAttachModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Target className="w-48 h-48 text-primary" />
              </div>
              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-on-surface tracking-tighter uppercase">
                    Attach Protocol <span className="text-primary">Node</span>
                  </h3>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] opacity-40">
                    Select existing protocol manifest to bind
                  </p>
                </div>
                <button onClick={() => setIsAttachModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {allPoliciesQuery.isLoading ? (
                  <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60 text-center py-6">Loading policies...</p>
                ) : (allPoliciesQuery.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => attachPolicy.mutate(p.id)}
                    disabled={!!attachedPolicies.find((a) => a.id === p.id) || attachPolicy.isPending}
                    className={`w-full p-4 glass-panel rounded-2xl flex items-center justify-between border-transparent transition-all group relative ${
                      attachedPolicies.find((a) => a.id === p.id)
                        ? 'opacity-40 grayscale cursor-not-allowed'
                        : 'hover:border-primary/40 hover:bg-white/5'
                    }`}
                  >
                    <div className="text-left">
                      <p className="text-[10px] font-black text-on-surface uppercase tracking-tight">{p.name}</p>
                      <p className="text-[8px] font-mono text-primary uppercase mt-0.5 opacity-60">SCOPE: {p.scope} // PRIORITY: {p.priority}</p>
                    </div>
                    {attachedPolicies.find((a) => a.id === p.id)
                      ? <CheckCircle2 className="w-4 h-4 text-primary" />
                      : <Plus className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                    }
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remove member confirm */}
      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove member"
        description="This will remove the member from this team. Their account and API key remain active."
        confirmLabel="Remove"
        destructive
        onConfirm={() => removeTarget && removeMember.mutate(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Change tier modal */}
      <AnimatePresence>
        {tierTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setTierTarget(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl"
            >
              <h2 className="text-xl font-black uppercase tracking-tight mb-6">Change Member Tier</h2>
              <select
                value={tierTarget.tier}
                onChange={(e) => setTierTarget({ ...tierTarget, tier: e.target.value as 'MEMBER' | 'SENIOR' | 'LEAD' })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 focus:ring-0 transition-all appearance-none mb-6"
              >
                <option value="MEMBER" className="bg-surface">MEMBER</option>
                <option value="SENIOR" className="bg-surface">SENIOR</option>
                <option value="LEAD" className="bg-surface">LEAD</option>
              </select>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setTierTarget(null)}
                  className="px-5 py-2.5 bg-white/5 border border-white/10 text-on-surface-variant font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => changeTier.mutate(tierTarget)}
                  disabled={changeTier.isPending}
                  className="px-5 py-2.5 bg-primary text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {changeTier.isPending ? 'Saving...' : 'Save Tier'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

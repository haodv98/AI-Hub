/* eslint-disable react/react-in-jsx-scope */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRightLeft, CheckCircle2, ChevronLeft, Database, Edit2, Plus, Search, Trash2, Zap } from 'lucide-react';
import { PolicyScopeFilterButton } from '@/components/atoms/PolicyScopeFilterButton';
import { PolicyToggleButton } from '@/components/atoms/PolicyToggleButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ENGINES } from '@/common/constants';
import api from '@/lib/api';

type PolicyScope = 'ORG' | 'TEAM' | 'ROLE' | 'USER';

interface Policy {
  id: string;
  name: string;
  scope: PolicyScope;
  target: string;
  priority: number;
  active: boolean;
  allowedModels: string[];
  limits: {
    rpm: number;
    dailyTokens: number;
    monthlyBudget: number;
  };
  fallback: {
    enabled: boolean;
    threshold: number;
    fromModel: string;
    toModel: string;
  };
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
    limits?: {
      rpm?: number;
      dailyTokens?: number;
      monthlyBudgetUsd?: number;
    };
    fallback?: {
      enabled?: boolean;
      thresholdPct?: number;
      fromModel?: string;
      toModel?: string;
    };
  };
}

interface PolicyFormState {
  name: string;
  scope: PolicyScope;
  target: string;
  priority: number;
  isActive: boolean;
  limits: {
    rpm: number;
    dailyTokens: number;
    monthlyBudget: number;
  };
  fallback: {
    enabled: boolean;
    threshold: number;
    fromModel: string;
    toModel: string;
  };
}

const mapApiPolicy = (policy: ApiPolicy): Policy => {
  const scope: PolicyScope = policy.userId ? 'USER' : policy.teamId && policy.tier ? 'ROLE' : policy.teamId ? 'TEAM' : 'ORG';
  return {
    id: policy.id,
    name: policy.name ?? 'Untitled policy',
    scope,
    target: policy.userId ?? policy.teamId ?? 'AIHub-Global',
    priority: policy.priority ?? 0,
    active: policy.isActive ?? true,
    allowedModels: policy.allowedEngines ?? [],
    limits: {
      rpm: policy.config?.limits?.rpm ?? 60,
      dailyTokens: policy.config?.limits?.dailyTokens ?? 250000,
      monthlyBudget: policy.config?.limits?.monthlyBudgetUsd ?? 500,
    },
    fallback: {
      enabled: policy.config?.fallback?.enabled ?? false,
      threshold: policy.config?.fallback?.thresholdPct ?? 80,
      fromModel: policy.config?.fallback?.fromModel ?? '',
      toModel: policy.config?.fallback?.toModel ?? '',
    },
  };
};

const toFormState = (policy?: Policy): PolicyFormState => ({
  name: policy?.name ?? '',
  scope: policy?.scope ?? 'ORG',
  target: policy?.target ?? '',
  priority: policy?.priority ?? 0,
  isActive: policy?.active ?? true,
  limits: {
    rpm: policy?.limits.rpm ?? 60,
    dailyTokens: policy?.limits.dailyTokens ?? 250000,
    monthlyBudget: policy?.limits.monthlyBudget ?? 500,
  },
  fallback: {
    enabled: policy?.fallback.enabled ?? false,
    threshold: policy?.fallback.threshold ?? 80,
    fromModel: policy?.fallback.fromModel ?? '',
    toModel: policy?.fallback.toModel ?? '',
  },
});

function usePolicies() {
  return useQuery<Policy[]>({
    queryKey: ['policies'],
    queryFn: async () => {
      const response = await api.get('/policies');
      const raw = (response.data?.data ?? []) as ApiPolicy[];
      return raw.map(mapApiPolicy);
    },
  });
}

export default function Policies() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = usePolicies();
  const [view, setView] = useState<'LIST' | 'EDITOR'>('LIST');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | PolicyScope>('ALL');
  const [localToggles, setLocalToggles] = useState<Record<string, boolean>>({});
  const [editorSelectedEngines, setEditorSelectedEngines] = useState<string[]>([]);
  const [formState, setFormState] = useState<PolicyFormState>(toFormState());
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const policies = data ?? [];
  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId) ?? null;
  const filteredPolicies = useMemo(() => {
    return policies.filter((policy) => {
      const matchSearch =
        policy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        policy.target.toLowerCase().includes(searchTerm.toLowerCase());
      const matchScope = scopeFilter === 'ALL' || policy.scope === scopeFilter;
      return matchSearch && matchScope;
    });
  }, [policies, scopeFilter, searchTerm]);

  const isActive = (policy: Policy) =>
    localToggles[policy.id] === undefined ? policy.active : localToggles[policy.id];

  const togglePolicyMutation = useMutation({
    mutationFn: async ({ policyId, isActive: nextIsActive }: { policyId: string; isActive: boolean }) => {
      await api.patch(`/policies/${policyId}`, { isActive: nextIsActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  const savePolicyMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formState.name,
        priority: formState.priority,
        isActive: formState.isActive,
        allowedEngines: editorSelectedEngines,
        ...(formState.scope === 'TEAM' || formState.scope === 'ROLE'
          ? { teamId: formState.target || undefined }
          : {}),
        ...(formState.scope === 'USER' ? { userId: formState.target || undefined } : {}),
        ...(formState.scope === 'ROLE' ? { tier: 'MEMBER' } : {}),
        config: {
          limits: {
            rpm: formState.limits.rpm,
            dailyTokens: formState.limits.dailyTokens,
            monthlyBudgetUsd: formState.limits.monthlyBudget,
          },
          fallback: formState.fallback.enabled
            ? {
                enabled: true,
                thresholdPct: formState.fallback.threshold,
                fromModel: formState.fallback.fromModel,
                toModel: formState.fallback.toModel,
              }
            : { enabled: false },
        },
      };

      if (selectedPolicyId) {
        await api.patch(`/policies/${selectedPolicyId}`, payload);
      } else {
        await api.post('/policies', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setView('LIST');
      setSelectedPolicyId(null);
      setEditorSelectedEngines([]);
      setFormState(toFormState());
      setEditorError(null);
    },
    onError: () => {
      setEditorError('Failed to save policy configuration. Please verify fields and retry.');
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: async (policyId: string) => {
      await api.delete(`/policies/${policyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      setDeleteTargetId(null);
    },
    onError: () => {
      setEditorError('Failed to delete policy. Please retry.');
    },
  });

  const handleEdit = (policyId: string) => {
    setSelectedPolicyId(policyId);
    const editingPolicy = policies.find((p) => p.id === policyId);
    setEditorSelectedEngines(editingPolicy?.allowedModels ?? []);
    setFormState(toFormState(editingPolicy ?? undefined));
    setEditorError(null);
    setView('EDITOR');
  };

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {view === 'LIST' ? (
          <motion.div key="policies-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="max-w-2xl">
                <h1 className="text-5xl font-black text-on-surface tracking-tighter uppercase">
                  Protocol <span className="text-primary opacity-80">Policies</span>
                </h1>
                <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
                  Define computational boundaries and model access rules. Precedence layers: USER &gt; ROLE &gt; TEAM &gt; ORG.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPolicyId(null);
                  setEditorSelectedEngines([]);
                  setFormState(toFormState());
                  setEditorError(null);
                  setView('EDITOR');
                }}
                className="flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
              >
                <Plus className="w-4 h-4" /> Create Protocol
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-8 glass-panel p-4 rounded-xl flex items-center gap-3">
                <Search className="text-primary w-4 h-4 ml-2" />
                <label htmlFor="policies-search" className="sr-only">Search policies</label>
                <input
                  id="policies-search"
                  type="text"
                  placeholder="Query protocols by name or designation..."
                  className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant/40"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div className="md:col-span-4 glass-panel p-2 rounded-xl flex" role="group" aria-label="Policy scope filter">
                {(['ALL', 'ORG', 'TEAM', 'ROLE', 'USER'] as const).map((scope) => (
                  <PolicyScopeFilterButton
                    key={scope}
                    label={scope}
                    isActive={scopeFilter === scope}
                    onClick={() => setScopeFilter(scope)}
                  />
                ))}
              </div>
            </div>

            {toggleError && (
              <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
                {toggleError}
              </div>
            )}

            {isError && (
              <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
                Failed to load policies from API.
              </div>
            )}

            {isLoading ? (
              <div className="glass-panel rounded-3xl p-10 text-center text-on-surface-variant text-xs font-bold uppercase tracking-widest opacity-60">
                Loading policy matrix...
              </div>
            ) : (
              <div className="glass-panel rounded-3xl overflow-x-auto border border-white/5">
                <table className="w-full min-w-[920px] text-left">
                  <thead>
                    <tr className="bg-white/5">
                      <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Policy Name / Scope</th>
                      <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-center">Priority</th>
                      <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Authorized Engines</th>
                      <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Rate Limits</th>
                      <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Status</th>
                      <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Operations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredPolicies.map((policy) => (
                      <tr key={policy.id} className="group hover:bg-white/5 transition-all">
                        <td className="px-6 py-8">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-on-surface uppercase tracking-tight">{policy.name}</span>
                            <span className="text-[10px] text-primary font-mono uppercase tracking-widest opacity-70 italic">
                              {policy.scope}: {policy.target}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-8 text-center">
                          <span className="text-xs font-mono font-bold text-on-surface">{policy.priority}</span>
                        </td>
                        <td className="px-6 py-8">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {(policy.allowedModels.length ? policy.allowedModels : ['ALL']).slice(0, 2).map((model) => (
                              <span key={model} className="text-[9px] bg-white/5 border border-white/5 px-2 py-0.5 rounded text-on-surface-variant uppercase font-bold tracking-tighter">
                                {model}
                              </span>
                            ))}
                            {policy.allowedModels.length > 2 && (
                              <span className="text-[9px] text-primary font-black ml-1">+{policy.allowedModels.length - 2} More</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-8">
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                              <Zap className="w-3 h-3 text-primary" /> {policy.limits.rpm} RPM
                            </div>
                            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                              <Database className="w-3 h-3 text-primary" /> {policy.limits.dailyTokens.toLocaleString()} TOKENS/DAY
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-8">
                          <PolicyToggleButton
                            active={isActive(policy)}
                            onToggle={async () => {
                              setToggleError(null);
                              const current = isActive(policy);
                              const next = !current;
                              setLocalToggles((prev) => ({ ...prev, [policy.id]: next }));
                              try {
                                await togglePolicyMutation.mutateAsync({
                                  policyId: policy.id,
                                  isActive: next,
                                });
                              } catch {
                                setLocalToggles((prev) => ({ ...prev, [policy.id]: current }));
                                setToggleError('Failed to update policy status. Please retry.');
                              }
                            }}
                          />
                        </td>
                        <td className="px-6 py-8 text-right">
                          <div className="flex items-center justify-end gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                            <button type="button" onClick={() => handleEdit(policy.id)} className="p-2 glass-panel hover:text-primary transition-all rounded-lg">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setDeleteTargetId(policy.id)} className="p-2 glass-panel hover:text-error transition-all rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredPolicies.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                          No policies match the current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="policies-editor" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-8">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setView('LIST')}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant hover:text-primary transition-all"
              >
                <ChevronLeft className="w-4 h-4" /> Return to Manifest
              </button>
            </div>

            <div className="glass-panel p-8 rounded-3xl space-y-8">
              <h3 className="text-xl font-black uppercase tracking-tight">Policy Configuration</h3>
              <p className="text-[11px] text-on-surface-variant uppercase tracking-widest opacity-60">
                {selectedPolicy
                  ? `Editing "${selectedPolicy.name}" (${selectedPolicy.scope})`
                  : 'Create a new policy with full limits and fallback settings.'}
              </p>

              {editorError && (
                <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
                  {editorError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Policy name"
                  className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                />
                <select
                  value={formState.scope}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, scope: event.target.value as PolicyScope }))
                  }
                  className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                >
                  <option value="ORG">ORG</option>
                  <option value="TEAM">TEAM</option>
                  <option value="ROLE">ROLE</option>
                  <option value="USER">USER</option>
                </select>
                <input
                  type="text"
                  value={formState.target}
                  onChange={(event) => setFormState((prev) => ({ ...prev, target: event.target.value }))}
                  placeholder={formState.scope === 'ORG' ? 'Optional' : 'Target ID (teamId/userId)'}
                  className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                />
                <input
                  type="number"
                  min={0}
                  value={formState.priority}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, priority: Number(event.target.value) || 0 }))
                  }
                  placeholder="Priority"
                  className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="number"
                  min={0}
                  value={formState.limits.rpm}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      limits: { ...prev.limits, rpm: Number(event.target.value) || 0 },
                    }))
                  }
                  placeholder="RPM"
                  className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                />
                <input
                  type="number"
                  min={0}
                  value={formState.limits.dailyTokens}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      limits: { ...prev.limits, dailyTokens: Number(event.target.value) || 0 },
                    }))
                  }
                  placeholder="Daily Tokens"
                  className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                />
                <input
                  type="number"
                  min={0}
                  value={formState.limits.monthlyBudget}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      limits: { ...prev.limits, monthlyBudget: Number(event.target.value) || 0 },
                    }))
                  }
                  placeholder="Monthly Budget USD"
                  className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">
                  Authorized Compute Engines
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ENGINES.map((engine) => (
                    <button
                      key={engine}
                      type="button"
                      onClick={() =>
                        setEditorSelectedEngines((prev) =>
                          prev.includes(engine)
                            ? prev.filter((item) => item !== engine)
                            : [...prev, engine],
                        )
                      }
                      className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider rounded-xl border transition-all text-left flex items-center justify-between ${
                        editorSelectedEngines.includes(engine)
                          ? 'bg-primary/20 border-primary/30 text-primary shadow-[0_0_10px_rgba(56,189,248,0.1)]'
                          : 'bg-white/5 border-white/5 text-on-surface-variant hover:border-white/10'
                      }`}
                    >
                      {engine}
                      <CheckCircle2 className={`w-3 h-3 ${editorSelectedEngines.includes(engine) ? 'opacity-100' : 'opacity-40'}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl border border-primary/20 space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4" /> Fallback Configuration
                </h4>
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={formState.fallback.enabled}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        fallback: { ...prev.fallback, enabled: event.target.checked },
                      }))
                    }
                  />
                  Enable fallback
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formState.fallback.threshold}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        fallback: { ...prev.fallback, threshold: Number(event.target.value) || 0 },
                      }))
                    }
                    placeholder="Threshold %"
                    className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                  />
                  <input
                    type="text"
                    value={formState.fallback.fromModel}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        fallback: { ...prev.fallback, fromModel: event.target.value },
                      }))
                    }
                    placeholder="From model"
                    className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                  />
                  <input
                    type="text"
                    value={formState.fallback.toModel}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        fallback: { ...prev.fallback, toModel: event.target.value },
                      }))
                    }
                    placeholder="To model"
                    className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setView('LIST')}
                  className="px-6 py-3 rounded-xl bg-white/5 text-on-surface-variant text-[10px] font-black uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => savePolicyMutation.mutate()}
                  disabled={!formState.name.trim() || savePolicyMutation.isPending}
                  className="px-6 py-3 rounded-xl bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
                >
                  {savePolicyMutation.isPending ? 'Saving...' : selectedPolicyId ? 'Update Policy' : 'Create Policy'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Delete Policy?"
        description="This policy will be removed and no longer applied in cascade resolution."
        confirmLabel={deletePolicyMutation.isPending ? 'Deleting...' : 'Delete Policy'}
        destructive
        onConfirm={() => deleteTargetId && deletePolicyMutation.mutate(deleteTargetId)}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}

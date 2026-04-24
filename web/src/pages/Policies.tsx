/* eslint-disable react/react-in-jsx-scope */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Activity, AlertTriangle, ArrowRightLeft, CheckCircle2, ChevronLeft, Database, Edit2, Globe, Info, Lock, Plus, Search, Shield, Sliders, ToggleLeft, ToggleRight, Trash2, Zap } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PolicyScopeFilterButton } from '@/components/atoms/PolicyScopeFilterButton';
import { PolicyToggleButton } from '@/components/atoms/PolicyToggleButton';
import { ENGINES } from '@/common/constants';
import api from '@/lib/api';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

const SPARK_DATA = [
  { v: 10 }, { v: 15 }, { v: 12 }, { v: 30 }, { v: 25 },
  { v: 45 }, { v: 40 }, { v: 60 }, { v: 55 }, { v: 70 },
];

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
  const [editorTab, setEditorTab] = useState<'CONFIG' | 'SIMULATION'>('CONFIG');
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushToast } = useGlobalUi();

  const policies = data ?? [];
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
      setSearchParams({});
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
      pushToast('Transmission', 'Policy detached from manifest');
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
    setEditorTab('CONFIG');
    setSearchParams({ manifest: policyId });
    setView('EDITOR');
  };

  useEffect(() => {
    const manifestId = searchParams.get('manifest');
    if (!manifestId || !policies.length) return;
    const matched = policies.find((policy) => policy.id === manifestId);
    if (!matched) return;
    setSelectedPolicyId(matched.id);
    setEditorSelectedEngines(matched.allowedModels ?? []);
    setFormState(toFormState(matched));
    setView('EDITOR');
  }, [policies, searchParams]);

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
                  setEditorTab('CONFIG');
                  setSearchParams({});
                  setView('EDITOR');
                }}
                className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
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
                            <button
                              type="button"
                              onClick={() => deletePolicyMutation.mutate(policy.id)}
                              title="Detach protocol instantly"
                              className="p-2 glass-panel hover:text-error transition-all rounded-lg"
                            >
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
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditorTab('CONFIG')}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${editorTab === 'CONFIG' ? 'bg-white/10 text-primary border border-primary/20' : 'text-on-surface-variant'}`}
                >
                  Configuration
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab('SIMULATION')}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${editorTab === 'SIMULATION' ? 'bg-white/10 text-primary border border-primary/20' : 'text-on-surface-variant'}`}
                >
                  Tactical Simulation
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <AnimatePresence mode="wait">
                {editorTab === 'CONFIG' ? (
                  <motion.div key="config" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="lg:col-span-8 space-y-6">
                    <div className="glass-panel p-6 rounded-3xl space-y-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-lg font-black uppercase tracking-tight">Identity Designation</h3>
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest opacity-40">Define protocol scope and target subjects</p>
                        </div>
                        <div className={`p-3 rounded-2xl border transition-all ${formState.isActive ? 'bg-primary/20 border-primary/20 text-primary shadow-lg shadow-primary/5' : 'bg-white/5 border-white/5 text-on-surface-variant'}`}>
                          <Shield className="w-5 h-5" />
                        </div>
                      </div>
                      {editorError && <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">{editorError}</div>}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-8 space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Protocol Identifier</label>
                          <input type="text" value={formState.name} onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g., Fleet Master Allocation" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all" />
                        </div>
                        <div className="md:col-span-4 space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Priority [0-100]</label>
                          <input type="number" min={0} value={formState.priority} onChange={(event) => setFormState((prev) => ({ ...prev, priority: Number(event.target.value) || 0 }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all text-center font-mono" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-5 space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Deployment Scope</label>
                          <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                            {(['ORG', 'TEAM', 'ROLE', 'USER'] as const).map((scope) => (
                              <button key={scope} type="button" onClick={() => setFormState((prev) => ({ ...prev, scope }))} className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded transition-all ${formState.scope === scope ? 'bg-primary text-on-primary shadow-xl' : 'text-on-surface-variant hover:bg-white/5'}`}>{scope}</button>
                            ))}
                          </div>
                        </div>
                        <div className="md:col-span-7 space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Target Subject IDs</label>
                          <input type="text" value={formState.target} onChange={(event) => setFormState((prev) => ({ ...prev, target: event.target.value }))} placeholder="OPERATOR, TEAM-ALPHA, user_882..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-[10px] font-bold uppercase tracking-widest focus:border-primary/40 transition-all font-mono" />
                        </div>
                      </div>
                    </div>

                    <div className="glass-panel p-6 rounded-3xl space-y-6">
                      <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-3"><Activity className="text-primary w-5 h-5 shadow-sm" /> Resource Boundaries</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Max Signal Burst [RPM]</label>
                          <input type="number" min={0} value={formState.limits.rpm} onChange={(event) => setFormState((prev) => ({ ...prev, limits: { ...prev.limits, rpm: Number(event.target.value) || 0 } }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs font-bold text-primary focus:border-primary/40 focus:ring-0 transition-all" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Daily Cap [Tokens]</label>
                          <input type="number" min={0} value={formState.limits.dailyTokens} onChange={(event) => setFormState((prev) => ({ ...prev, limits: { ...prev.limits, dailyTokens: Number(event.target.value) || 0 } }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs font-bold text-primary focus:border-primary/40 focus:ring-0 transition-all" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Monthly Credit [$]</label>
                          <input type="number" min={0} value={formState.limits.monthlyBudget} onChange={(event) => setFormState((prev) => ({ ...prev, limits: { ...prev.limits, monthlyBudget: Number(event.target.value) || 0 } }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-xs font-bold text-primary focus:border-primary/40 focus:ring-0 transition-all" />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Authorized Compute Engines</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {ENGINES.map((engine) => (
                            <button
                              key={engine}
                              type="button"
                              onClick={() => setEditorSelectedEngines((prev) => (prev.includes(engine) ? prev.filter((item) => item !== engine) : [...prev, engine]))}
                              className={`px-3 py-2.5 text-[9px] font-bold uppercase tracking-wider rounded-xl border transition-all text-left flex items-center justify-between ${editorSelectedEngines.includes(engine) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-white/5 border-white/10 text-on-surface-variant hover:border-white/20'}`}
                            >
                              <span className="truncate">{engine}</span>
                              <CheckCircle2 className={`w-3 h-3 ${editorSelectedEngines.includes(engine) ? 'opacity-100' : 'opacity-40'}`} />
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/5 space-y-6">
                        <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-3">
                          <Globe className="text-primary w-5 h-5 shadow-sm" /> Network Integrity
                        </h3>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center px-1 mb-1">
                            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60">IP Authorization Allowlist</label>
                            <span className="text-[8px] font-mono text-primary opacity-40 uppercase">CIDR or Static IPs (Comma Separated)</span>
                          </div>
                          <div className="relative group">
                            <div className="absolute left-4 top-4 text-primary/40 group-focus-within:text-primary transition-colors">
                              <Lock className="w-4 h-4" />
                            </div>
                            <textarea
                              placeholder="e.g., 192.168.1.1, 10.0.0.0/24, 203.0.113.50"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 h-24 text-[10px] font-mono text-on-surface placeholder:text-on-surface-variant/20 focus:border-primary/40 transition-all resize-none shadow-inner"
                            />
                          </div>
                          <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl flex gap-3">
                            <Info className="text-primary w-4 h-4 flex-shrink-0 mt-0.5" />
                            <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed">
                              Incoming requests from outside these authorized IP coordinates will be rejected with an <span className="text-error font-black">ACCESS_DENIED_NETWORK</span> signal.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="glass-panel p-8 rounded-3xl space-y-8">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                          <ArrowRightLeft className="text-primary w-5 h-5" /> Failover Protocol
                        </h3>
                        <button
                          type="button"
                          onClick={() => setFormState((prev) => ({ ...prev, fallback: { ...prev.fallback, enabled: !prev.fallback.enabled } }))}
                          className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${formState.fallback.enabled ? 'text-primary' : 'text-on-surface-variant opacity-40'}`}
                        >
                          {formState.fallback.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                        </button>
                      </div>
                      {formState.fallback.enabled && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-white/5"
                        >
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Saturation Threshold [%]</label>
                            <input type="number" min={0} max={100} value={formState.fallback.threshold} onChange={(event) => setFormState((prev) => ({ ...prev, fallback: { ...prev.fallback, threshold: Number(event.target.value) || 0 } }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-xs font-bold text-primary focus:border-primary/40 focus:ring-0 transition-all" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">From Engine</label>
                            <select value={formState.fallback.fromModel} onChange={(event) => setFormState((prev) => ({ ...prev, fallback: { ...prev.fallback, fromModel: event.target.value } }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all appearance-none cursor-pointer">
                              <option value="" className="bg-surface">Select Anchor</option>
                              {ENGINES.map((e) => <option key={e} value={e} className="bg-surface">{e}</option>)}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">To Engine [Failover]</label>
                            <select value={formState.fallback.toModel} onChange={(event) => setFormState((prev) => ({ ...prev, fallback: { ...prev.fallback, toModel: event.target.value } }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all appearance-none cursor-pointer">
                              <option value="" className="bg-surface">Select Failover</option>
                              {ENGINES.map((e) => <option key={e} value={e} className="bg-surface">{e}</option>)}
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="simulation" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="lg:col-span-8 space-y-6">
                    <div className="glass-panel p-10 rounded-3xl border border-primary/20 space-y-8 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
                        <Zap className="w-64 h-64 text-primary" />
                      </div>
                      <div className="relative z-10 space-y-8">
                        <div className="flex justify-between items-start">
                          <div className="max-w-md">
                            <h3 className="text-3xl font-black uppercase tracking-tighter mb-4 text-primary">Simulation <span className="text-on-surface">Matrix</span></h3>
                            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest leading-relaxed opacity-60">
                              Predict cluster impact and resource consumption based on the configured protocol parameters.
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-3">
                              <div className="relative w-8 h-8">
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                  <circle cx="18" cy="18" r="16" fill="none" className="stroke-white/10" strokeWidth="3" />
                                  <circle cx="18" cy="18" r="16" fill="none" className="stroke-primary" strokeWidth="3" strokeDasharray="100" strokeDashoffset="5" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-[8px] font-black text-primary">95</span>
                                </div>
                              </div>
                              <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Confidence Score</p>
                                <p className="text-[10px] font-black text-primary uppercase">High Precision</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-6 p-8 bg-white/5 rounded-3xl border border-white/5">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Input Subject Overview</h4>
                            <div className="space-y-4">
                              {[
                                { label: 'Designation', value: 'Alex Rivera // sc-001' },
                                { label: 'Auth Role', value: 'OPERATOR // DEFENSE' },
                                { label: 'Engines', value: 'GPT-4o, Sonnet-3.5', highlight: true },
                              ].map((row) => (
                                <div key={row.label} className="flex justify-between items-center pb-2 border-b border-white/5">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">{row.label}</span>
                                  <span className={`text-[10px] font-mono font-bold uppercase ${row.highlight ? 'text-primary' : 'text-on-surface'}`}>{row.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-6 p-8 bg-white/5 rounded-3xl border border-white/5">
                            <div className="flex justify-between items-center">
                              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Predicted Flux Trends</h4>
                              <div className="px-2 py-1 bg-error/10 border border-error/20 rounded-lg text-[8px] font-black text-error uppercase animate-pulse">Spike Alert</div>
                            </div>
                            <div className="space-y-5">
                              {[
                                { label: 'Saturation', value: '12.4% Optimal', stroke: '#38bdf8', data: SPARK_DATA },
                                { label: 'Cost Delta', value: '-$42.10 (Saved)', stroke: '#f59e0b', data: SPARK_DATA },
                                { label: 'Latency Impact', value: '~420ms', stroke: '#ef4444', data: [...SPARK_DATA].reverse(), warn: true },
                              ].map((row) => (
                                <div key={row.label} className="flex justify-between items-center">
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant block">{row.label}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono font-bold text-on-surface">{row.value}</span>
                                      {row.warn && <AlertTriangle className="w-3 h-3 text-error" />}
                                    </div>
                                  </div>
                                  <div className="w-24 h-8">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={row.data}>
                                        <Line type="monotone" dataKey="v" stroke={row.stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 pt-6 border-t border-white/5">
                          <div className="flex justify-between items-center">
                            <div className="space-y-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Probability of Saturation Failover</span>
                              <p className="text-[8px] font-bold text-error uppercase tracking-widest">Potential spike detected at 16:00 UTC</p>
                            </div>
                            <span className="text-[14px] font-mono font-bold text-primary">2.4%</span>
                          </div>
                          <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden relative">
                            <motion.div initial={{ width: 0 }} animate={{ width: '12.4%' }} className="h-full bg-primary status-glow relative z-10" />
                            <div className="absolute top-0 left-[65%] w-0.5 h-full bg-error/40 z-20" />
                            <div className="absolute top-0 left-[85%] w-0.5 h-full bg-error/40 z-20" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-8 bg-error/5 border border-error/20 rounded-3xl flex gap-6 relative overflow-hidden">
                      <div className="absolute top-[-20px] left-[-20px] p-10 opacity-5 rotate-12 pointer-events-none">
                        <AlertTriangle className="w-24 h-24 text-error" />
                      </div>
                      <AlertTriangle className="text-error w-10 h-10 flex-shrink-0 relative z-10" />
                      <div className="space-y-2 relative z-10">
                        <h4 className="text-lg font-black uppercase tracking-tight text-error">Anomalous Spike Prediction</h4>
                        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed opacity-60">
                          The current daily token cap for 'Sarah Chen' might trigger failover protocols prematurely during peak cycle hours (14:00 - 18:00 UTC). Predicted spike: +240% above baseline.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="lg:col-span-4 space-y-8">
                <div className="glass-panel p-8 rounded-3xl space-y-8">
                  <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3"><Sliders className="text-primary w-5 h-5" /> Hierarchy Layering</h3>
                  <div className="space-y-6 relative ml-4">
                    <div className="absolute left-[-17px] top-6 bottom-4 w-px bg-white/10 border-l border-dashed border-white/20" />
                    {[
                      { label: 'USER Level', desc: 'Highest precision. Overrides all.', scope: 'USER' as PolicyScope },
                      { label: 'ROLE Cluster', desc: 'Inherited by assigned agents.', scope: 'ROLE' as PolicyScope },
                      { label: 'TEAM Tactical', desc: 'Unit-wide boundaries.', scope: 'TEAM' as PolicyScope },
                      { label: 'ORG Global', desc: 'Baseline foundational logic.', scope: 'ORG' as PolicyScope },
                    ].map((layer) => {
                      const active = formState.scope === layer.scope;
                      return (
                        <div key={layer.scope} className="relative group">
                          <div className={`absolute left-[-22px] top-1.5 w-3 h-3 rounded-full border-2 border-surface transition-all ${active ? 'bg-primary status-glow scale-125' : 'bg-surface-container-high border-white/20'}`} />
                          <div className={`transition-all ${active ? 'translate-x-1' : 'opacity-40 group-hover:opacity-60'}`}>
                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${active ? 'text-primary' : 'text-on-surface'}`}>{layer.label}</p>
                            <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest italic">{layer.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex gap-3">
                    <Info className="text-primary w-4 h-4 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed">
                      Rules are evaluated from top to bottom. The first match on the User-Role link triggers absolute enforcement.
                    </p>
                  </div>
                </div>

                <div className="glass-panel p-8 rounded-3xl space-y-8">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-black uppercase tracking-tight">Active Reach</h3>
                    <span className="text-[10px] font-mono text-primary font-bold uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded">12 subjects</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      { name: 'Sarah Chen', team: 'Neural-Ops', status: 'MATCH' },
                      { name: 'Alex Rivera', team: 'Fleet-Command', status: 'INHERIT' },
                      { name: 'Elena Belova', team: 'Intel', status: 'INHERIT' },
                    ].map((person) => (
                      <div key={person.name} className="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-xl group hover:bg-white/10 transition-all cursor-crosshair">
                        <div className="flex gap-4 items-center">
                          <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center font-black text-[9px] uppercase tracking-tighter border border-white/10 text-primary">
                            {person.name[0]}
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-on-surface uppercase tracking-tight">{person.name}</p>
                            <p className="text-[8px] text-primary font-mono opacity-50 uppercase tracking-widest">{person.team}</p>
                          </div>
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${person.status === 'MATCH' ? 'bg-primary/20 text-primary' : 'bg-white/10 text-on-surface-variant'}`}>{person.status}</span>
                      </div>
                    ))}
                    <button type="button" className="w-full py-2 text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant hover:text-white transition-all opacity-40">View full manifest →</button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => savePolicyMutation.mutate()}
                  disabled={!formState.name.trim() || savePolicyMutation.isPending}
                  className="w-full py-5 bg-primary text-on-primary rounded-3xl text-[12px] font-black uppercase tracking-[0.35em] disabled:opacity-40"
                >
                  {savePolicyMutation.isPending ? 'Deploying Transmission...' : 'Deploy Protocol Changes'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, ArrowRight, X, Edit2, Trash2,
  GripVertical, Shield, Zap, AlertCircle,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import { getPaginatedEnvelope, postEnvelope, patchEnvelope, deleteEnvelope } from '@/lib/api';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

interface ComboModel {
  id: string;
  provider: string;
  model: string;
  active: boolean;
}

interface ComboStats {
  aliases: number;
  requests: number;
  fallbackRate: string;
  trend?: { day: string; req: number }[];
}

interface ProviderCombo {
  id: string;
  name: string;
  strategy: 'FALLBACK' | 'ROUND_ROBIN';
  scope: 'ORG' | 'TEAM';
  scopeName: string;
  active: boolean;
  stats: ComboStats;
  models: ComboModel[];
}

interface ComboForm {
  name: string;
  strategy: 'FALLBACK' | 'ROUND_ROBIN';
  scope: 'ORG' | 'TEAM';
  models: ComboModel[];
}

const DEFAULT_FORM: ComboForm = {
  name: '',
  strategy: 'FALLBACK',
  scope: 'ORG',
  models: [{ id: crypto.randomUUID(), provider: '', model: '', active: true }],
};

const STRATEGY_COLORS = {
  FALLBACK: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ROUND_ROBIN: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
} as const;

const SCOPE_COLORS = {
  ORG: 'bg-blue-500/10 text-blue-400',
  TEAM: 'bg-purple-500/10 text-purple-400',
} as const;

function useCombos() {
  return useQuery({
    queryKey: ['combos'],
    queryFn: () => getPaginatedEnvelope<ProviderCombo[]>('/admin/combos', { page: 1, limit: 100 }),
  });
}

export default function Combos() {
  const qc = useQueryClient();
  const { pushToast } = useGlobalUi();
  const { data: comboPage, isLoading, isError } = useCombos();

  const [searchTerm, setSearchTerm] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<ProviderCombo | null>(null);
  const [form, setForm] = useState<ComboForm>(DEFAULT_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<ProviderCombo | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const closeDrawer = () => {
    setShowDrawer(false);
    setEditing(null);
    setForm(DEFAULT_FORM);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowDrawer(true);
  };

  const openEdit = (combo: ProviderCombo) => {
    setEditing(combo);
    setForm({
      name: combo.name,
      strategy: combo.strategy,
      scope: combo.scope,
      models: combo.models.map((m) => ({ ...m })),
    });
    setShowDrawer(true);
  };

  const create = useMutation({
    mutationFn: (data: ComboForm) => postEnvelope<ProviderCombo>('/admin/combos', data),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['combos'] });
      closeDrawer();
      pushToast('Transmission', 'Provider combo deployed');
    },
    onError: () => { setMutationError('Failed to create combo. Please retry.'); },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ComboForm }) =>
      patchEnvelope<ProviderCombo>(`/admin/combos/${id}`, data),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['combos'] });
      closeDrawer();
      pushToast('Transmission', 'Combo configuration updated');
    },
    onError: () => { setMutationError('Failed to update combo. Please retry.'); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteEnvelope(`/admin/combos/${id}`),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['combos'] });
      setDeleteConfirm(null);
      pushToast('Transmission', 'Combo removed from registry');
    },
    onError: () => { setMutationError('Failed to remove combo. Please retry.'); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      patchEnvelope(`/admin/combos/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['combos'] }),
  });

  const addHop = () => {
    setForm((f) => ({
      ...f,
      models: [...f.models, { id: crypto.randomUUID(), provider: '', model: '', active: true }],
    }));
  };

  const removeHop = (id: string) => {
    setForm((f) => ({ ...f, models: f.models.filter((m) => m.id !== id) }));
  };

  const updateHop = (id: string, updates: Partial<ComboModel>) => {
    setForm((f) => ({
      ...f,
      models: f.models.map((m) => m.id === id ? { ...m, ...updates } : m),
    }));
  };

  const handleCommit = () => {
    if (editing) {
      update.mutate({ id: editing.id, data: form });
    } else {
      create.mutate(form);
    }
  };

  const isPending = create.isPending || update.isPending;
  const isFormValid = form.name.trim().length > 0 && form.models.length >= 1 &&
    form.models.every((m) => m.provider.trim() && m.model.trim());

  const combos = comboPage?.data ?? [];
  const filtered = combos.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black text-on-surface tracking-tighter uppercase"
          >
            Provider <span className="text-primary opacity-80">Combos</span>
          </motion.h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Architect resilient model chains with automated failover and load balancing.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
        >
          <Plus className="w-4 h-4" /> Create Combo
        </button>
      </div>

      {/* Search */}
      <div className="max-w-md glass-panel p-3.5 rounded-xl flex items-center gap-3 border border-white/5 focus-within:border-primary/30 transition-all">
        <Search className="text-primary w-4 h-4" />
        <label htmlFor="combos-search" className="sr-only">Search combos</label>
        <input
          id="combos-search"
          type="text"
          placeholder="Search combos..."
          className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant placeholder:opacity-40"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isError && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          Failed to load provider combos. Please refresh.
        </div>
      )}
      {mutationError && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          {mutationError}
        </div>
      )}

      {/* Card Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-panel p-8 rounded-[2.5rem] border border-white/5 space-y-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-12 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded-xl" />
                </div>
              </div>
              <Skeleton className="h-20 w-full rounded-2xl" />
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {filtered.map((combo) => (
            <motion.div
              key={combo.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-panel p-8 rounded-[2.5rem] border border-white/5 bg-[#0a0a0a]/40 hover:border-primary/20 transition-all duration-500 group"
            >
              {/* Card Header */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-2xl font-black text-on-surface uppercase tracking-tight group-hover:text-primary transition-colors">
                      {combo.name}
                    </h3>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border tracking-widest ${STRATEGY_COLORS[combo.strategy]}`}>
                      {combo.strategy}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${SCOPE_COLORS[combo.scope]}`}>
                      {combo.scope}
                    </span>
                    <span className="text-[10px] font-bold text-on-surface-variant opacity-60 uppercase border-l border-white/10 pl-2">
                      {combo.scopeName}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`Toggle ${combo.name} active`}
                    onClick={() => toggleActive.mutate({ id: combo.id, active: !combo.active })}
                    className="h-6 w-12 bg-white/5 rounded-full relative p-1 flex-shrink-0"
                  >
                    <div className={`w-4 h-4 rounded-full absolute transition-all duration-300 top-1 ${
                      combo.active ? 'right-1 bg-primary shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'left-1 bg-on-surface-variant/40'
                    }`} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${combo.name}`}
                    onClick={() => openEdit(combo)}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-on-surface-variant hover:text-primary transition-all"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${combo.name}`}
                    onClick={() => setDeleteConfirm(combo)}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-on-surface-variant hover:text-error transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Model Chain */}
              <div className="overflow-x-auto mb-10 -mx-2 px-2">
                <div className="flex items-center gap-4 pb-2">
                  {combo.models.map((m, idx) => (
                    <div key={m.id} className="flex items-center gap-4 flex-shrink-0">
                      <div className="relative glass-panel p-4 rounded-2xl border border-white/10 bg-white/5 min-w-[140px]">
                        <div className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-primary text-on-primary text-[9px] font-black rounded-lg flex items-center justify-center shadow-lg">
                          {idx + 1}
                        </div>
                        <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-1">{m.provider || '—'}</p>
                        <p className="text-xs font-mono font-bold text-on-surface truncate">{m.model || '—'}</p>
                        {!m.active && (
                          <div className="absolute inset-0 bg-surface/60 backdrop-blur-[1px] rounded-2xl flex items-center justify-center">
                            <span className="text-[8px] font-black text-on-surface-variant uppercase tracking-[0.2em] bg-surface/80 px-2 py-1 rounded border border-white/10">DISABLED</span>
                          </div>
                        )}
                      </div>
                      {idx < combo.models.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-on-surface-variant opacity-30 flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats + Sparkline */}
              <div className="grid grid-cols-3 gap-3 border-t border-white/5 pt-6 relative">
                <div>
                  <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-50 mb-1">Attached Aliases</p>
                  <p className="text-xl font-black text-on-surface">{combo.stats.aliases}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-50 mb-1">Today&apos;s Traffic</p>
                  <p className="text-xl font-black text-primary">{combo.stats.requests}</p>
                </div>
                <div>
                  <p className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest opacity-50 mb-1">Fallback Rate</p>
                  <p className="text-xl font-black text-orange-400">{combo.stats.fallbackRate}</p>
                </div>
                {combo.stats.trend && combo.stats.trend.length > 0 && (
                  <div className="absolute bottom-0 right-0 w-32 h-12 opacity-30 pointer-events-none" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={combo.stats.trend}>
                        <defs>
                          <linearGradient id={`trend-${combo.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="req"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          fill={`url(#trend-${combo.id})`}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && !isLoading && (
            <div className="lg:col-span-2 glass-panel p-14 rounded-3xl text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
              No provider combos match the current query.
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Drawer */}
      <AnimatePresence>
        {showDrawer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isPending && closeDrawer()}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="drawer-title"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-2xl h-full bg-surface border-l border-white/5 shadow-2xl p-10 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 id="drawer-title" className="text-3xl font-black uppercase tracking-tight">
                    {editing ? 'Edit Combo' : 'Chain Architect'}
                  </h2>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mt-1 flex items-center gap-2">
                    <Shield className="w-3 h-3" /> Advanced Provider Orchestration
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close drawer"
                  onClick={() => !isPending && closeDrawer()}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-10">
                {/* Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 ml-1">Combo System Name</label>
                  <input
                    type="text"
                    placeholder="e.g. enterprise-ha-fallback"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black tracking-widest focus:border-primary/40 focus:ring-0 transition-all placeholder:opacity-20 placeholder:font-normal"
                  />
                </div>

                {/* Strategy + Scope */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 ml-1">Traffic Strategy</label>
                    <div className="space-y-2">
                      {(['FALLBACK', 'ROUND_ROBIN'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, strategy: s }))}
                          className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                            form.strategy === s
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-white/5 border-white/5 text-on-surface-variant hover:border-primary/40'
                          }`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest">{s}</span>
                          {form.strategy === s && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 ml-1">Domain Scope</label>
                    <div className="space-y-2">
                      {(['ORG', 'TEAM'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, scope: s }))}
                          className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                            form.scope === s
                              ? 'bg-primary/10 border-primary text-primary'
                              : 'bg-white/5 border-white/5 text-on-surface-variant hover:border-primary/40'
                          }`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-widest">{s}</span>
                          {form.scope === s && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chain Sequence */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Chain Sequence</label>
                    <button
                      type="button"
                      onClick={addHop}
                      className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <Plus className="w-3 h-3" /> Add Hop
                    </button>
                  </div>

                  {form.models.length === 0 && (
                    <div className="p-6 border border-dashed border-white/10 rounded-2xl text-center">
                      <p className="text-[10px] font-black text-on-surface-variant opacity-40 uppercase tracking-widest">No hops — click &quot;+ Add Hop&quot;</p>
                    </div>
                  )}

                  <AnimatePresence mode="popLayout">
                    {form.models.map((m, idx) => (
                      <motion.div
                        key={m.id}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.18 }}
                        className="flex gap-4 items-center group mb-3"
                      >
                        <div className="cursor-grab opacity-20 group-hover:opacity-60 transition-opacity p-1">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="flex-1 glass-panel p-5 rounded-2xl border border-white/5 bg-white/5 flex items-center gap-4 group-hover:border-white/10 transition-all">
                          <span className="text-[10px] font-black text-on-surface-variant/40 w-5">{idx + 1}</span>
                          <input
                            type="text"
                            placeholder="PROVIDER"
                            value={m.provider}
                            onChange={(e) => updateHop(m.id, { provider: e.target.value.toUpperCase() })}
                            className="bg-transparent border-none border-b border-white/10 focus:border-primary focus:ring-0 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface w-24 p-0 pb-1 transition-colors placeholder:opacity-20"
                          />
                          <input
                            type="text"
                            placeholder="model-id"
                            value={m.model}
                            onChange={(e) => updateHop(m.id, { model: e.target.value })}
                            className="bg-transparent border-none border-b border-white/10 focus:border-primary focus:ring-0 text-xs font-mono font-bold text-on-surface flex-1 p-0 pb-1 transition-colors placeholder:opacity-20"
                          />
                          <button
                            type="button"
                            aria-label={m.active ? 'Disable hop' : 'Enable hop'}
                            onClick={() => updateHop(m.id, { active: !m.active })}
                            className={`p-1.5 rounded-lg transition-all ${m.active ? 'text-primary bg-primary/10' : 'text-on-surface-variant/40 bg-white/5'}`}
                          >
                            <Zap className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove hop"
                            onClick={() => removeHop(m.id)}
                            disabled={form.models.length <= 1}
                            className="p-1.5 text-on-surface-variant hover:text-error transition-colors disabled:opacity-20 disabled:pointer-events-none opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Chain Intelligence info */}
                <div className="p-6 bg-primary/5 border border-primary/20 rounded-3xl flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-on-surface uppercase tracking-widest mb-1">Chain Intelligence</h4>
                    <p className="text-[10px] font-bold text-on-surface-variant leading-relaxed opacity-80 uppercase tracking-tight">
                      {form.strategy === 'FALLBACK'
                        ? 'Requests execute in sequential order. 4xx or 5xx responses immediately shift traffic to the next hop in the chain.'
                        : 'Requests are distributed across active hops via weighted round-robin for uniform load across provider quotas.'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-10 flex gap-4">
                  <button
                    type="button"
                    onClick={closeDrawer}
                    disabled={isPending}
                    className="px-10 py-5 bg-white/5 border border-white/10 text-on-surface font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all disabled:opacity-40"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleCommit}
                    disabled={!isFormValid || isPending}
                    className="flex-1 py-5 bg-primary text-on-primary font-black text-[11px] uppercase tracking-[0.3em] rounded-2xl shadow-2xl hover:brightness-110 active:scale-95 transition-all status-glow disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isPending ? 'Deploying...' : editing ? 'Update Combo' : 'Deploy Combo'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !remove.isPending && setDeleteConfirm(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md glass-panel p-8 rounded-3xl border-error/20 shadow-2xl"
            >
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mx-auto border border-error/20">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <h2 id="modal-title" className="text-2xl font-black uppercase tracking-tight text-error">Decommission Combo?</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mt-1 opacity-60">Permanent Registry Removal</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl text-[11px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-wide border border-white/5">
                  Removing <span className="text-primary font-mono">{deleteConfirm.name}</span> will break all alias mappings referencing this combo.
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(null)}
                    disabled={remove.isPending}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
                  >
                    Abort
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(deleteConfirm.id)}
                    disabled={remove.isPending}
                    className="flex-1 py-3 bg-error text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {remove.isPending ? 'Removing...' : 'Confirm Purge'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, ArrowRight, Globe, Layers, X, Edit2, Trash2,
  Check, Activity, Target, Zap, Info,
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { SegmentedFilterButton } from '@/components/atoms/SegmentedFilterButton';
import { getPaginatedEnvelope, postEnvelope, patchEnvelope, deleteEnvelope } from '@/lib/api';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

interface ModelAlias {
  id: string;
  clientModel: string;
  resolvesTo: string;
  scope: 'ORG' | 'TEAM' | 'KEY';
  scopeTarget: string;
  priority: number;
  active: boolean;
  type: 'SINGLE' | 'COMBO';
}

interface AliasForm {
  scope: 'ORG' | 'TEAM' | 'KEY';
  clientModel: string;
  type: 'SINGLE' | 'COMBO';
  resolvesTo: string;
  priority: number;
  active: boolean;
}

const DEFAULT_FORM: AliasForm = {
  scope: 'ORG',
  clientModel: '',
  type: 'SINGLE',
  resolvesTo: '',
  priority: 100,
  active: true,
};

const SCOPE_COLORS: Record<'ORG' | 'TEAM' | 'KEY', { badge: string; dot: string; text: string }> = {
  ORG:  { badge: 'bg-blue-500/10 text-blue-400',    dot: 'bg-blue-400 border-blue-400',     text: 'text-blue-400' },
  TEAM: { badge: 'bg-purple-500/10 text-purple-400', dot: 'bg-purple-400 border-purple-400', text: 'text-purple-400' },
  KEY:  { badge: 'bg-amber-500/10 text-amber-400',   dot: 'bg-amber-400 border-amber-400',   text: 'text-amber-400' },
};

const SCOPE_LABELS: Record<'KEY' | 'TEAM' | 'ORG', string> = {
  KEY:  'Layer 1: Key Override',
  TEAM: 'Layer 2: Team Policy',
  ORG:  'Layer 3: Global Defaults',
};

function useAliases() {
  return useQuery({
    queryKey: ['aliases'],
    queryFn: () => getPaginatedEnvelope<ModelAlias[]>('/admin/aliases', { page: 1, limit: 100 }),
  });
}

export default function Aliases() {
  const qc = useQueryClient();
  const { pushToast } = useGlobalUi();
  const { data: aliasPage, isLoading, isError } = useAliases();

  const [searchTerm, setSearchTerm] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'ORG' | 'TEAM' | 'KEY'>('ALL');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editing, setEditing] = useState<ModelAlias | null>(null);
  const [form, setForm] = useState<AliasForm>(DEFAULT_FORM);
  const [traceTarget, setTraceTarget] = useState<ModelAlias | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ModelAlias | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowDrawer(true);
  };

  const openEdit = (alias: ModelAlias) => {
    setEditing(alias);
    setForm({
      scope: alias.scope,
      clientModel: alias.clientModel,
      type: alias.type,
      resolvesTo: alias.resolvesTo,
      priority: alias.priority,
      active: alias.active,
    });
    setShowDrawer(true);
  };

  const closeDrawer = () => {
    setShowDrawer(false);
    setEditing(null);
    setForm(DEFAULT_FORM);
  };

  const create = useMutation({
    mutationFn: (data: AliasForm) => postEnvelope<ModelAlias>('/admin/aliases', data),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aliases'] });
      closeDrawer();
      pushToast('Transmission', 'Alias mapping committed');
    },
    onError: () => { setMutationError('Failed to create alias. Please retry.'); },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AliasForm }) =>
      patchEnvelope<ModelAlias>(`/admin/aliases/${id}`, data),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aliases'] });
      closeDrawer();
      pushToast('Transmission', 'Alias mapping updated');
    },
    onError: () => { setMutationError('Failed to update alias. Please retry.'); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteEnvelope(`/admin/aliases/${id}`),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aliases'] });
      setDeleteConfirm(null);
      pushToast('Transmission', 'Alias mapping removed');
    },
    onError: () => { setMutationError('Failed to delete alias. Please retry.'); },
  });

  const handleCommit = () => {
    if (!form.clientModel.trim() || !form.resolvesTo.trim()) return;
    if (editing) {
      update.mutate({ id: editing.id, data: form });
    } else {
      create.mutate(form);
    }
  };

  const aliases = aliasPage?.data ?? [];
  const filtered = aliases.filter((a) => {
    const matchesSearch =
      a.clientModel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.resolvesTo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesScope = scopeFilter === 'ALL' || a.scope === scopeFilter;
    return matchesSearch && matchesScope;
  });

  const isPending = create.isPending || update.isPending;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black text-on-surface tracking-tighter uppercase"
          >
            Model <span className="text-primary opacity-80">Aliases</span>
          </motion.h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Map client model requests to optimized provider endpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
        >
          <Plus className="w-4 h-4" /> Add Alias Mapping
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 glass-panel p-2 rounded-xl flex" role="group" aria-label="Scope filter">
          {(['ALL', 'ORG', 'TEAM', 'KEY'] as const).map((s) => (
            <SegmentedFilterButton
              key={s}
              label={s === 'ALL' ? 'All Scopes' : s}
              isActive={scopeFilter === s}
              onClick={() => setScopeFilter(s)}
            />
          ))}
        </div>
        <div className="w-full md:w-80 glass-panel p-3.5 rounded-xl flex items-center gap-3 border border-white/5 focus-within:border-primary/30 transition-all">
          <Search className="text-primary w-4 h-4" />
          <label htmlFor="aliases-search" className="sr-only">Search aliases</label>
          <input
            id="aliases-search"
            type="text"
            placeholder="Search patterns or resolvers..."
            className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant placeholder:opacity-40"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isError && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          Failed to load alias mappings. Please refresh.
        </div>
      )}
      {mutationError && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          {mutationError}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={5} cols={6} />
      ) : (
        <div className="glass-panel rounded-3xl overflow-x-auto border border-white/5">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="bg-white/5">
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Client Model Pattern</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-center">Direction</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Resolves To</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Scope</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Priority</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((alias) => (
                <tr
                  key={alias.id}
                  onClick={() => setTraceTarget(alias)}
                  className="group hover:bg-white/5 transition-all cursor-pointer"
                >
                  <td className="px-8 py-7">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full bg-primary ${alias.active ? 'animate-pulse' : 'opacity-20'}`} />
                      <span className="text-sm font-mono font-bold text-on-surface group-hover:text-primary transition-colors">
                        &quot;{alias.clientModel}&quot;
                      </span>
                      {alias.clientModel.includes('*') && (
                        <span className="text-[8px] font-black bg-white/5 border border-white/10 px-2 py-0.5 rounded text-on-surface-variant uppercase">GLOB</span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-7 text-center">
                    <ArrowRight className="w-4 h-4 text-on-surface-variant/30 mx-auto" />
                  </td>
                  <td className="px-8 py-7">
                    {alias.type === 'COMBO' ? (
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-orange-400" />
                        <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest bg-orange-400/10 px-3 py-1 rounded-full border border-orange-400/20">
                          {alias.resolvesTo}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 font-mono text-xs text-on-surface opacity-80">
                        <Globe className="w-3.5 h-3.5 text-primary opacity-50" />
                        {alias.resolvesTo}
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-7">
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${SCOPE_COLORS[alias.scope].badge}`}>
                        {alias.scope}
                      </span>
                      {alias.scopeTarget && (
                        <span className="text-xs font-bold text-on-surface-variant opacity-60">{alias.scopeTarget}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-7">
                    <span className="text-xs font-mono font-bold text-primary">{alias.priority}</span>
                  </td>
                  <td className="px-8 py-7 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                      <button
                        type="button"
                        aria-label={`View trace for ${alias.clientModel}`}
                        onClick={(e) => { e.stopPropagation(); setTraceTarget(alias); }}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit alias ${alias.clientModel}`}
                        onClick={(e) => { e.stopPropagation(); openEdit(alias); }}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-on-surface-variant hover:text-primary transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete alias ${alias.clientModel}`}
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(alias); }}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-on-surface-variant hover:text-error transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-14 text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                    No alias mappings match the current query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
              onClick={closeDrawer}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full bg-surface border-l border-white/5 shadow-2xl p-10 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">
                    {editing ? 'Edit Alias Registry' : 'New Alias Registry'}
                  </h2>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-1">
                    Map a client model pattern to a provider endpoint
                  </p>
                </div>
                <button type="button" onClick={closeDrawer} className="p-2 hover:bg-white/5 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                    Resolution Scope
                  </label>
                  <div className="flex gap-2">
                    {(['ORG', 'TEAM', 'KEY'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, scope: s }))}
                        className={`flex-1 py-3 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          form.scope === s
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-white/5 border-white/10 text-on-surface-variant hover:border-primary/40'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                    Client Pattern (String or Glob)
                  </label>
                  <div className="relative">
                    <Target className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-40" />
                    <input
                      type="text"
                      placeholder="claude-sonnet-*"
                      value={form.clientModel}
                      onChange={(e) => setForm((f) => ({ ...f, clientModel: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-xs font-mono font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                    Resolver Strategy
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: 'SINGLE' }))}
                      className={`p-4 border rounded-2xl text-left transition-all ${
                        form.type === 'SINGLE' ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <p className={`text-[10px] font-black uppercase mb-1 ${form.type === 'SINGLE' ? 'text-primary' : 'text-on-surface'}`}>Single Model</p>
                      <p className="text-[8px] font-bold text-on-surface-variant uppercase">Direct point-to-point</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: 'COMBO' }))}
                      className={`p-4 border rounded-2xl text-left transition-all ${
                        form.type === 'COMBO' ? 'bg-orange-400/10 border-orange-400' : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <p className={`text-[10px] font-black uppercase mb-1 ${form.type === 'COMBO' ? 'text-orange-400' : 'text-on-surface'}`}>Provider Combo</p>
                      <p className="text-[8px] font-bold text-on-surface-variant uppercase">Fallback / Round-Robin</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                    Resolve Destination
                  </label>
                  <input
                    type="text"
                    placeholder={form.type === 'COMBO' ? 'production-claude' : 'anthropic/claude-3-5-sonnet'}
                    value={form.resolvesTo}
                    onChange={(e) => setForm((f) => ({ ...f, resolvesTo: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">Priority Rank</label>
                    <input
                      type="number"
                      value={form.priority}
                      onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono font-bold text-on-surface focus:border-primary/40 transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">Status</label>
                    <div className="h-[52px] flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl gap-3">
                      <button
                        type="button"
                        aria-label="Toggle active status"
                        onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                        className="w-10 h-5 bg-primary/20 rounded-full relative p-1"
                      >
                        <div className={`w-3 h-3 rounded-full absolute transition-all ${form.active ? 'right-1 bg-primary' : 'left-1 bg-on-surface-variant/40'}`} />
                      </button>
                      <span className={`text-[10px] font-black uppercase ${form.active ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                        {form.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-10 flex gap-4">
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="px-8 py-5 bg-white/5 border border-white/10 text-on-surface font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleCommit}
                    disabled={!form.clientModel.trim() || !form.resolvesTo.trim() || isPending}
                    className="flex-1 py-5 bg-primary text-on-primary font-black text-[11px] uppercase tracking-[0.3em] rounded-2xl shadow-2xl hover:brightness-110 active:scale-95 transition-all status-glow disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isPending ? 'Saving...' : editing ? 'Update Mapping' : 'Commit Mapping'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Resolution Trace Drawer */}
      <AnimatePresence>
        {traceTarget && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTraceTarget(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full bg-surface border-l border-white/5 shadow-2xl p-10 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Resolution Audit</h3>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-1">Tracing logical mapping per-request</p>
                </div>
                <button type="button" onClick={() => setTraceTarget(null)} className="p-2 hover:bg-white/5 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-12">
                <div className="glass-panel p-6 rounded-3xl border-primary/20 bg-primary/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-2">Simulation Context</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Request Model</p>
                      <p className="text-sm font-mono font-bold text-on-surface">&quot;{traceTarget.clientModel.replace('*', 'sonnet-4-5')}&quot;</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Scope</p>
                      <p className="text-sm font-bold text-on-surface uppercase">{traceTarget.scope}</p>
                    </div>
                  </div>
                </div>

                <div className="relative space-y-12 pl-8">
                  <div className="absolute left-3 top-2 bottom-2 w-0.5 border-l border-dashed border-white/10" />
                  {(['KEY', 'TEAM', 'ORG'] as const).map((scope) => {
                    const isMatch = traceTarget.scope === scope;
                    const colors = SCOPE_COLORS[scope];
                    return (
                      <div key={scope} className="relative">
                        <div className={`absolute -left-[27px] top-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${isMatch ? colors.dot : 'bg-surface border-white/10'}`}>
                          {isMatch && <Check className="w-2.5 h-2.5 text-surface" />}
                        </div>
                        <div className={isMatch ? 'opacity-100' : 'opacity-40'}>
                          <h4 className={`text-[11px] font-black uppercase tracking-widest mb-1 ${colors.text}`}>
                            {SCOPE_LABELS[scope]}
                          </h4>
                          <p className="text-[10px] font-bold text-on-surface leading-snug">
                            {isMatch
                              ? `Verified match — ${traceTarget.scopeTarget || traceTarget.scope}`
                              : 'No override at this level.'}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <div className="relative pt-6 border-t border-white/5">
                    <div className="p-6 bg-white/5 rounded-3xl border border-primary/20 shadow-[0_0_30px_rgba(56,189,248,0.05)]">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-4">Resolved Destination</p>
                      <div className="flex items-center gap-4">
                        <Zap className="w-6 h-6 text-primary" />
                        <div>
                          <p className="text-lg font-black font-mono text-on-surface">{traceTarget.resolvesTo}</p>
                          <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Status: HEALTHY</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4">
                  <Info className="w-5 h-5 text-on-surface-variant opacity-40" />
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed">
                    Priority: <span className="text-primary">{traceTarget.priority}</span>. Highest priority mapping wins on multiple matches.
                  </p>
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
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md glass-panel p-8 rounded-3xl border-error/20 shadow-2xl"
            >
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mx-auto border border-error/20">
                  <Trash2 className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-error">Remove Mapping?</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mt-1 opacity-60">This cannot be undone</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl text-[11px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-wide border border-white/5">
                  Alias <span className="text-primary font-mono">&quot;{deleteConfirm.clientModel}&quot;</span>{' '}
                  → <span className="text-on-surface">{deleteConfirm.resolvesTo}</span> will be permanently removed.
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
                    {remove.isPending ? 'Removing...' : 'Confirm Remove'}
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

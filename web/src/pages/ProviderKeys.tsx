/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, ShieldCheck, Key, Trash2, Edit2, RotateCcw,
  X, Check, Server, Database, AlertTriangle,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { SegmentedFilterButton } from '@/components/atoms/SegmentedFilterButton';
import { getPaginatedEnvelope, postEnvelope, patchEnvelope, deleteEnvelope } from '@/lib/api';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

interface ProviderKey {
  id: string;
  provider: string;
  scope: 'ORG-SHARED' | 'TEAM-SHARED' | 'PER-SEAT';
  assignedTo: string;
  apiKeyMasked: string;
  quota: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  lastUsedAt: string | null;
  vaultPath: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureVersion?: string;
}

interface CreateProviderKeyDto {
  provider: string;
  scope: string;
  targetId: string;
  apiKey?: string;
  vertexSaJson?: string;
  ollamaBaseUrl?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureVersion?: string;
  rpm?: string;
  tpm?: string;
}

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', color: 'orange' },
  { id: 'openai', name: 'OpenAI', color: 'emerald' },
  { id: 'gemini', name: 'Google Gemini', color: 'blue' },
  { id: 'deepseek', name: 'DeepSeek', color: 'indigo' },
  { id: 'groq', name: 'Groq', color: 'red' },
  { id: 'azure', name: 'Azure OpenAI', color: 'sky' },
  { id: 'vertex', name: 'Google Vertex', color: 'green' },
  { id: 'ollama', name: 'Ollama (Local)', color: 'yellow' },
];

const AZURE_API_VERSIONS = ['2024-10-21', '2024-08-01-preview', '2024-05-01-preview'];

const SCOPE_LABELS = ['ALL', 'ORG-SHARED', 'TEAM-SHARED', 'PER-SEAT'] as const;

const EMPTY_FORM: CreateProviderKeyDto & { provider: string; scope: string; rpm: string; tpm: string } = {
  provider: '',
  scope: 'ORG-SHARED',
  targetId: '',
  apiKey: '',
  vertexSaJson: '',
  ollamaBaseUrl: 'http://localhost:11434',
  azureEndpoint: '',
  azureDeployment: '',
  azureVersion: '',
  rpm: '',
  tpm: '',
};

function useProviderKeys() {
  return useQuery({
    queryKey: ['provider-keys'],
    queryFn: () => getPaginatedEnvelope<ProviderKey[]>('/admin/provider-keys', { page: 1, limit: 100 }),
  });
}

function ProviderIcon({ providerId }: { providerId: string }) {
  const p = PROVIDERS.find((x) => x.id === providerId.toLowerCase());
  const color = p?.color ?? 'primary';
  const initial = (p?.name ?? providerId).charAt(0).toUpperCase();
  return (
    <div className={`w-6 h-6 bg-${color}-500/20 rounded flex items-center justify-center text-[10px] font-bold text-${color}-500`}>
      {initial}
    </div>
  );
}

export default function ProviderKeys() {
  const qc = useQueryClient();
  const { pushToast } = useGlobalUi();
  const { data: keysPage, isLoading, isError } = useProviderKeys();

  const [searchTerm, setSearchTerm] = useState('');
  const [scopeFilter, setScopeFilter] = useState<typeof SCOPE_LABELS[number]>('ALL');
  const [addStep, setAddStep] = useState<1 | 2 | 3>(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingKey, setEditingKey] = useState<ProviderKey | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProviderKey | null>(null);
  const [rotateConfirm, setRotateConfirm] = useState<ProviderKey | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const resetModal = () => {
    setShowAddModal(false);
    setEditingKey(null);
    setAddStep(1);
    setForm({ ...EMPTY_FORM });
    setMutationError(null);
  };

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setEditingKey(null); setAddStep(1); setShowAddModal(true); };
  const openEdit = (key: ProviderKey) => {
    setForm({
      provider: key.provider.toLowerCase(),
      scope: key.scope,
      targetId: key.assignedTo,
      apiKey: '',
      vertexSaJson: '',
      ollamaBaseUrl: key.apiKeyMasked.startsWith('http') ? key.apiKeyMasked : 'http://localhost:11434',
      azureEndpoint: key.azureEndpoint ?? '',
      azureDeployment: key.azureDeployment ?? '',
      azureVersion: key.azureVersion ?? '',
      rpm: '',
      tpm: '',
    });
    setEditingKey(key);
    setAddStep(2);
    setShowAddModal(true);
  };

  const isCredentialValid = () => {
    if (form.provider === 'vertex') return form.vertexSaJson!.trim().length > 0;
    if (form.provider === 'ollama') return form.ollamaBaseUrl!.trim().length > 0;
    return (form.apiKey ?? '').length > 0 || !!editingKey;
  };

  const create = useMutation({
    mutationFn: (dto: CreateProviderKeyDto) =>
      postEnvelope<ProviderKey>('/admin/provider-keys', dto),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-keys'] });
      resetModal();
      pushToast('Transmission', 'Provider key secured in Vault');
    },
    onError: () => setMutationError('Failed to create provider key. Please retry.'),
  });

  const update = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateProviderKeyDto> }) =>
      patchEnvelope<ProviderKey>(`/admin/provider-keys/${id}`, dto),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-keys'] });
      resetModal();
      pushToast('Transmission', 'Provider key updated');
    },
    onError: () => setMutationError('Failed to update provider key.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteEnvelope(`/admin/provider-keys/${id}`),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-keys'] });
      setDeleteConfirm(null);
      pushToast('Transmission', 'Provider key removed from Vault');
    },
    onError: () => setMutationError('Failed to remove provider key.'),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => postEnvelope<{ rotated: boolean }>(`/admin/provider-keys/${id}/rotate`),
    onMutate: () => setMutationError(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['provider-keys'] });
      setRotateConfirm(null);
      pushToast('Transmission', 'Provider key rotated successfully');
    },
    onError: () => setMutationError('Failed to rotate provider key.'),
  });

  const handleConfirmCreate = () => {
    const dto: CreateProviderKeyDto = {
      provider: form.provider,
      scope: form.scope,
      targetId: form.targetId,
      ...(form.provider === 'vertex' && { vertexSaJson: form.vertexSaJson }),
      ...(form.provider === 'ollama' && { ollamaBaseUrl: form.ollamaBaseUrl }),
      ...(form.provider !== 'vertex' && form.provider !== 'ollama' && { apiKey: form.apiKey }),
      ...(form.provider === 'azure' && {
        azureEndpoint: form.azureEndpoint,
        azureDeployment: form.azureDeployment,
        azureVersion: form.azureVersion,
      }),
      rpm: form.rpm,
      tpm: form.tpm,
    };
    if (editingKey) {
      update.mutate({ id: editingKey.id, dto });
    } else {
      create.mutate(dto);
    }
  };

  const filteredKeys = (keysPage?.data ?? []).filter((k) => {
    const matchesSearch =
      k.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.assignedTo.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch && (scopeFilter === 'ALL' || k.scope === scopeFilter);
  });

  const totalKeys = keysPage?.pagination?.total ?? (keysPage?.data ?? []).length;
  const activeKeys = (keysPage?.data ?? []).filter((k) => k.status === 'ACTIVE').length;

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black text-on-surface tracking-tighter uppercase"
          >
            Provider <span className="text-primary opacity-80">Keys</span>
          </motion.h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Manage real API credentials secured in HashiCorp Vault.
            Supports org-shared, team-shared, and per-seat scopes.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
        >
          <Plus className="w-4 h-4" /> Add Provider Key
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Total Keys</p>
          <p className="text-2xl font-black">{totalKeys}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Active</p>
          <p className="text-2xl font-black text-primary">{activeKeys}</p>
        </div>
        <div className="glass-panel p-4 rounded-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Vault Backend</p>
          <p className="text-xs font-black text-primary font-mono mt-1">HashiCorp Vault</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 glass-panel p-4 rounded-xl flex items-center gap-3 border-white/10 focus-within:border-primary/40 transition-all">
          <Search className="text-primary w-4 h-4 ml-2" />
          <label htmlFor="pk-search" className="sr-only">Search provider keys</label>
          <input
            id="pk-search"
            type="text"
            placeholder="Search by provider or assignment..."
            className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant placeholder:opacity-40"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="md:col-span-4 glass-panel p-2 rounded-xl flex overflow-x-auto" role="group" aria-label="Scope filter">
          {SCOPE_LABELS.map((s) => (
            <SegmentedFilterButton
              key={s}
              label={s === 'ALL' ? s : s.replace('-SHARED', '')}
              isActive={scopeFilter === s}
              onClick={() => setScopeFilter(s)}
            />
          ))}
        </div>
      </div>

      {(isError || mutationError) && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          {mutationError ?? 'Failed to load provider keys. Please refresh.'}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={4} cols={7} />
      ) : (
        <div className="glass-panel rounded-3xl overflow-x-auto border border-white/5">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="bg-white/5">
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Provider</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Scope</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Assigned To</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Credential</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Quota</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Status</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredKeys.map((key) => (
                <tr key={key.id} className="group hover:bg-white/5 transition-all duration-300">
                  <td className="px-8 py-7">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                        <Database className="w-4 h-4 text-primary opacity-60" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-black uppercase tracking-tight">{key.provider}</span>
                        <span className="text-[8px] font-mono text-on-surface-variant opacity-40 mt-0.5 truncate max-w-[120px]">
                          {key.vaultPath}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-7">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter border ${
                      key.scope === 'ORG-SHARED'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : key.scope === 'TEAM-SHARED'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-white/10 text-on-surface-variant border-white/20'
                    }`}>
                      {key.scope}
                    </span>
                  </td>
                  <td className="px-8 py-7">
                    <span className="text-xs font-bold text-on-surface tracking-tight">{key.assignedTo}</span>
                  </td>
                  <td className="px-8 py-7 font-mono text-xs text-on-surface-variant opacity-70">
                    {key.apiKeyMasked}
                  </td>
                  <td className="px-8 py-7">
                    <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{key.quota}</span>
                  </td>
                  <td className="px-8 py-7">
                    <StatusBadge status={key.status} />
                  </td>
                  <td className="px-8 py-7 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                      <button
                        type="button"
                        aria-label={`Edit ${key.provider} key`}
                        onClick={() => openEdit(key)}
                        className="p-2 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-primary rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Rotate ${key.provider} key`}
                        onClick={() => setRotateConfirm(key)}
                        disabled={key.status !== 'ACTIVE'}
                        className="p-2 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-primary rounded-lg transition-all disabled:opacity-20 disabled:pointer-events-none"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${key.provider} key`}
                        onClick={() => setDeleteConfirm(key)}
                        className="p-2 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-error rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredKeys.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-14 text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                    No provider keys match the current query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={resetModal}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-10 rounded-[3rem] border-primary/20 bg-surface shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tighter">
                    {editingKey ? 'Edit Provider Key' : 'Issue Provider Secret'}
                  </h2>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mt-1 italic">
                    Step {addStep}: {addStep === 1 ? 'Select Provider' : addStep === 2 ? 'Config Credentials' : 'Final Validation'}
                  </p>
                </div>
                <button type="button" onClick={resetModal} className="p-2 hover:bg-white/5 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Step 1 — Select Provider */}
              {addStep === 1 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setForm({ ...form, provider: p.id }); setAddStep(2); }}
                      className={`p-6 rounded-3xl border text-left transition-all group ${
                        form.provider === p.id
                          ? 'bg-primary/20 border-primary shadow-[0_0_20px_rgba(56,189,248,0.1)]'
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="p-3 bg-white/5 rounded-2xl w-fit group-hover:scale-110 transition-transform">
                          <ProviderIcon providerId={p.id} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black uppercase tracking-tight">{p.name}</h4>
                          <p className="text-[9px] font-bold text-on-surface-variant opacity-40 uppercase tracking-widest mt-1">Native Protocol</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Step 2 — Config Credentials */}
              {addStep === 2 && (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-8">
                    {/* Left: Scope */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">Access Scope</label>
                      <div className="space-y-2">
                        {[
                          { id: 'ORG-SHARED', desc: 'Global context' },
                          { id: 'TEAM-SHARED', desc: 'Team specific' },
                          { id: 'PER-SEAT', desc: 'Individual seat' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setForm({ ...form, scope: s.id })}
                            className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                              form.scope === s.id
                                ? 'bg-primary/10 border-primary/40 text-primary'
                                : 'bg-white/5 border-white/5 text-on-surface-variant'
                            }`}
                          >
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-tight">{s.id}</p>
                              <p className="text-[8px] font-bold opacity-60 uppercase">{s.desc}</p>
                            </div>
                            {form.scope === s.id && <Check className="w-4 h-4" />}
                          </button>
                        ))}
                      </div>

                      {form.scope !== 'ORG-SHARED' && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                            {form.scope === 'TEAM-SHARED' ? 'Team Target' : 'User Email / ID'}
                          </label>
                          <input
                            type="text"
                            placeholder={form.scope === 'TEAM-SHARED' ? 'e.g. backend-team' : 'e.g. user@company.com'}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                            value={form.targetId}
                            onChange={(e) => setForm({ ...form, targetId: e.target.value })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Right: Credentials (conditional by provider) */}
                    <div className="space-y-4">
                      {form.provider === 'vertex' ? (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                            Service Account JSON
                          </label>
                          <textarea
                            rows={7}
                            placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  ...\n}'}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-mono text-on-surface focus:border-primary/40 focus:ring-0 transition-all resize-none"
                            value={form.vertexSaJson}
                            onChange={(e) => setForm({ ...form, vertexSaJson: e.target.value })}
                          />
                        </div>
                      ) : form.provider === 'ollama' ? (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                            Base URL
                          </label>
                          <div className="relative">
                            <Server className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-40" />
                            <input
                              type="text"
                              placeholder="http://localhost:11434"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-12 py-4 text-xs font-mono text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                              value={form.ollamaBaseUrl}
                              onChange={(e) => setForm({ ...form, ollamaBaseUrl: e.target.value })}
                            />
                          </div>
                          <p className="text-[9px] text-on-surface-variant opacity-50 ml-1">No auth header required for local models.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                            API Key {editingKey ? '(leave blank to keep current)' : ''}
                          </label>
                          <div className="relative">
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-40" />
                            <input
                              type="password"
                              placeholder="sk-..."
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-12 py-4 text-xs font-mono text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                              value={form.apiKey}
                              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                            />
                          </div>
                        </div>
                      )}

                      {/* Azure extra fields */}
                      {form.provider === 'azure' && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                              Endpoint URL
                            </label>
                            <input
                              type="text"
                              placeholder="https://{resource}.openai.azure.com"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-mono text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                              value={form.azureEndpoint}
                              onChange={(e) => setForm({ ...form, azureEndpoint: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                                Deployment
                              </label>
                              <input
                                type="text"
                                placeholder="gpt-4o-deploy"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                                value={form.azureDeployment}
                                onChange={(e) => setForm({ ...form, azureDeployment: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">
                                API Version
                              </label>
                              <select
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                                value={form.azureVersion}
                                onChange={(e) => setForm({ ...form, azureVersion: e.target.value })}
                              >
                                <option value="">Select version</option>
                                {AZURE_API_VERSIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quota */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">RPM Limit</label>
                          <input
                            type="text"
                            placeholder="60"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                            value={form.rpm}
                            onChange={(e) => setForm({ ...form, rpm: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 ml-1">TPM Limit (K)</label>
                          <input
                            type="text"
                            placeholder="100"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all"
                            value={form.tpm}
                            onChange={(e) => setForm({ ...form, tpm: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-2">
                    {!editingKey && (
                      <button
                        type="button"
                        onClick={() => setAddStep(1)}
                        className="px-8 py-4 bg-white/5 border border-white/10 text-on-surface font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all"
                      >
                        Back
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddStep(3)}
                      disabled={!isCredentialValid()}
                      className="flex-1 py-4 bg-primary text-on-primary font-black text-[10px] uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all status-glow disabled:opacity-30 disabled:pointer-events-none"
                    >
                      {editingKey ? 'Review Changes' : 'Finalize & Secure'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3 — Review + Confirm */}
              {addStep === 3 && (
                <div className="space-y-8">
                  <div className="p-8 bg-primary/5 border border-primary/20 rounded-[2rem] space-y-5">
                    <div className="flex items-center gap-4 border-b border-primary/10 pb-5">
                      <div className="p-4 bg-primary/10 rounded-3xl">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black uppercase tracking-tight">Security Affirmation</h4>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60 italic">
                          Preparing HashiCorp Vault Injection
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {[
                        ['Provider', form.provider.toUpperCase()],
                        ['Scope', form.scope],
                        ['Vault Path', `secret/aihub/providers/${form.provider}/${form.scope.toLowerCase()}`],
                        ['Encryption', 'AES-256-GCM'],
                        ...(form.provider === 'azure' && form.azureEndpoint ? [['Endpoint', form.azureEndpoint]] : []),
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between items-center px-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{label}</span>
                          <span className={`text-[10px] font-bold font-mono ${label === 'Encryption' ? 'text-emerald-400' : 'text-primary'}`}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 bg-error/10 border border-error/20 rounded-3xl flex gap-4">
                    <AlertTriangle className="text-error w-6 h-6 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-wider">
                      The plain-text credential will be immediately discarded from memory after transmission to the secure vault.
                      It cannot be retrieved from the AI Hub dashboard again.
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setAddStep(2)}
                      className="px-8 py-4 bg-white/5 border border-white/10 text-on-surface font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCreate}
                      disabled={create.isPending || update.isPending}
                      className="flex-1 py-4 bg-primary text-on-primary font-black text-[11px] uppercase tracking-[0.3em] rounded-2xl shadow-2xl hover:brightness-110 active:scale-95 transition-all status-glow disabled:opacity-40"
                    >
                      {create.isPending || update.isPending ? 'Securing…' : 'Confirm Vault Injection'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rotate Confirm Modal */}
      <AnimatePresence>
        {rotateConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !rotate.isPending && setRotateConfirm(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md glass-panel p-8 rounded-3xl border-primary/20 shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto border border-primary/20">
                <RotateCcw className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Rotate Key?</h2>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Rotating <span className="text-primary">{rotateConfirm.provider}</span> key will invalidate the current credential in Vault and generate a new one.
              </p>
              <div className="flex gap-4">
                <button type="button" onClick={() => setRotateConfirm(null)} disabled={rotate.isPending}
                  className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40">
                  Cancel
                </button>
                <button type="button" onClick={() => rotate.mutate(rotateConfirm.id)} disabled={rotate.isPending}
                  className="flex-1 py-3 bg-primary text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all status-glow disabled:opacity-40">
                  {rotate.isPending ? 'Rotating…' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !remove.isPending && setDeleteConfirm(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md glass-panel p-8 rounded-3xl border-error/20 shadow-2xl text-center space-y-6"
            >
              <div className="w-16 h-16 bg-error/10 text-error rounded-2xl flex items-center justify-center mx-auto border border-error/20">
                <Trash2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-error">Remove Key?</h2>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Removing the <span className="text-primary">{deleteConfirm.provider}</span> key ({deleteConfirm.scope}) will permanently delete it from Vault.
                This action <span className="text-error underline">cannot be undone</span>.
              </p>
              <div className="flex gap-4">
                <button type="button" onClick={() => setDeleteConfirm(null)} disabled={remove.isPending}
                  className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40">
                  Abort
                </button>
                <button type="button" onClick={() => remove.mutate(deleteConfirm.id)} disabled={remove.isPending}
                  className="flex-1 py-3 bg-error text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-40">
                  {remove.isPending ? 'Removing…' : 'Confirm Purge'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

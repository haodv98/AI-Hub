/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key, Plus, RotateCcw, Search, Trash2,
  Copy, Check, AlertTriangle, X, ShieldAlert, History, Terminal, Settings2,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { KeyRevealModal } from '@/components/keys/KeyRevealModal';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { SegmentedFilterButton } from '@/components/atoms/SegmentedFilterButton';
import { formatDate } from '@/lib/utils';
import { POLICY_MODEL_IDS_FLAT } from '@/common/model-ids';
import { getEnvelope, getPaginatedEnvelope, patchEnvelope, postEnvelope } from '@/lib/api';
import { useGlobalUi } from '@/contexts/GlobalUiContext';

interface ApiKey {
  id: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  /** When set, gateway ignores client `model` and uses this LiteLLM id (e.g. Gemini for Claude Code). */
  defaultUpstreamModel: string | null;
  user: { fullName: string; email: string };
  providerRouting: Array<{
    provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE';
    scope: 'PER_SEAT' | 'SHARED' | 'NONE';
    source: 'per-seat' | 'shared' | 'unconfigured';
  }>;
}

interface UsageEvent {
  timestamp: string;
  endpoint: string;
  status: string;
  tokens: number;
  model: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function useKeys() {
  return useQuery({
    queryKey: ['keys'],
    queryFn: () => getPaginatedEnvelope<ApiKey[]>('/keys', { page: 1, limit: 50 }),
  });
}

export default function Keys() {
  const qc = useQueryClient();
  const { data: keysPage, isLoading, isError } = useKeys();
  const [issueUserId, setIssueUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<ApiKey | null>(null);
  const [rotateConfirm, setRotateConfirm] = useState<ApiKey | null>(null);
  const [usageHistoryKey, setUsageHistoryKey] = useState<ApiKey | null>(null);
  const [gatewayModelKey, setGatewayModelKey] = useState<ApiKey | null>(null);
  const [gatewayModelDraft, setGatewayModelDraft] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [usageDateRange] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  });

  const usageHistoryQuery = useQuery<UsageEvent[]>({
    queryKey: ['key-usage', usageHistoryKey?.id, usageDateRange],
    queryFn: () => getEnvelope<UsageEvent[]>(`/keys/${usageHistoryKey!.id}/usage`, usageDateRange),
    enabled: !!usageHistoryKey,
  });

  const { pushToast } = useGlobalUi();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = useMutation({
    mutationFn: async (id: string) => postEnvelope<{ revoked: boolean }>(`/keys/${id}/revoke`),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setRevokeConfirm(null);
      pushToast('Transmission', 'Key revoked successfully');
    },
    onError: () => { setMutationError('Failed to revoke key. Please retry.'); },
  });

  const rotate = useMutation({
    mutationFn: async (id: string) => {
      const body = await postEnvelope<{ plaintext?: string }>(`/keys/${id}/rotate`);
      const plaintext = body?.plaintext;
      if (typeof plaintext !== 'string') throw new Error('Missing plaintext in rotation response');
      return plaintext;
    },
    onMutate: () => { setMutationError(null); },
    onSuccess: (plaintext) => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setRevealedKey(plaintext);
      setRotateConfirm(null);
      pushToast('Transmission', 'Key rotated and re-issued');
    },
    onError: () => { setMutationError('Failed to rotate key. Please retry.'); },
  });

  const saveGatewayModel = useMutation({
    mutationFn: async ({ id, model }: { id: string; model: string | null }) =>
      patchEnvelope<{ id: string; defaultUpstreamModel: string | null }>(`/keys/${id}/gateway-model`, {
        defaultUpstreamModel: model,
      }),
    onMutate: () => { setMutationError(null); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setGatewayModelKey(null);
      pushToast('Transmission', 'Gateway model override saved');
    },
    onError: () => { setMutationError('Failed to save gateway model override.'); },
  });

  const issueKey = useMutation({
    mutationFn: async (userId: string) => {
      setMutationError(null);
      const body = await postEnvelope<{ plaintext?: string }>(`/keys?userId=${encodeURIComponent(userId)}`);
      const plaintext = body?.plaintext;
      if (typeof plaintext !== 'string') throw new Error('Missing plaintext in issue key response');
      return plaintext;
    },
    onSuccess: (plaintext) => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setGeneratedKey(plaintext);
      setIssueUserId('');
      pushToast('Transmission', 'New key generated');
    },
    onError: () => { setMutationError('Failed to issue key. Please verify userId and retry.'); },
  });

  const filteredKeys = (keysPage?.data ?? []).filter((key) => {
    const userName = key.user?.fullName ?? '';
    const keyPrefix = key.keyPrefix ?? '';
    const matchesSearch =
      userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      keyPrefix.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || key.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const issueUserIdTrimmed = issueUserId.trim();
  const isValidIssueUserId = UUID_REGEX.test(issueUserIdTrimmed);
  const totalKeys = keysPage?.pagination?.total ?? (keysPage?.data ?? []).length;
  const activeKeys = (keysPage?.data ?? []).filter((k) => k.status === 'ACTIVE').length;
  const revokedKeys = (keysPage?.data ?? []).filter((k) => k.status === 'REVOKED').length;

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black text-on-surface tracking-tighter uppercase"
          >
            Internal <span className="text-primary opacity-80">Access Keys</span>
          </motion.h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Manage high-level authorization tokens for internal node communication.
            All keys are encrypted at rest and logged on every invocation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setIsGenerateModalOpen(true); setGeneratedKey(null); setIssueUserId(''); }}
          className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
        >
          <Plus className="w-4 h-4" /> Issue New Token
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
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Revoked</p>
          <p className="text-2xl font-black text-error">{revokedKeys}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 glass-panel p-4 rounded-xl flex items-center gap-3 border-white/10 focus-within:border-primary/40 transition-all">
          <Search className="text-primary w-4 h-4 ml-2" />
          <label htmlFor="keys-search" className="sr-only">Search access keys</label>
          <input
            id="keys-search"
            type="text"
            placeholder="Search by key prefix or user designation..."
            className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant placeholder:opacity-40"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="md:col-span-4 glass-panel p-2 rounded-xl flex" role="group" aria-label="Key status filter">
          {(['ALL', 'ACTIVE', 'REVOKED'] as const).map((item) => (
            <SegmentedFilterButton
              key={item}
              label={item}
              isActive={statusFilter === item}
              onClick={() => setStatusFilter(item)}
            />
          ))}
        </div>
      </div>

      {isError && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          Failed to load access keys. Please refresh.
        </div>
      )}

      {mutationError && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          {mutationError}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
        <div className="glass-panel rounded-3xl overflow-x-auto border border-white/5">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="bg-white/5">
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Token Designation</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Authorized User</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Security Status</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Calibrated</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Last Signal</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Provider Routing</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Gateway model</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredKeys.map((key) => (
                <tr
                  key={key.id}
                  onClick={() => setUsageHistoryKey(key)}
                  className="group hover:bg-white/5 transition-all duration-300 cursor-pointer"
                >
                  <td className="px-8 py-8">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-white/5 border border-white/10 ${key.status === 'ACTIVE' ? 'text-primary' : 'text-on-surface-variant'}`}>
                        <Key className="w-4 h-4" />
                      </div>
                      <span className="font-mono text-sm font-bold opacity-80">{key.keyPrefix}...</span>
                    </div>
                  </td>
                  <td className="px-8 py-8">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-on-surface uppercase tracking-wider">{key.user.fullName}</span>
                      <span className="text-[10px] text-primary font-mono mt-1 opacity-60 tracking-tighter lowercase">{key.user.email}</span>
                    </div>
                  </td>
                  <td className="px-8 py-8">
                    <StatusBadge status={key.status} />
                  </td>
                  <td className="px-8 py-8">
                    <span className="text-[10px] font-mono text-on-surface-variant opacity-60">{formatDate(key.createdAt)}</span>
                  </td>
                  <td className="px-8 py-8">
                    <span className="text-[10px] font-mono text-on-surface-variant opacity-60">
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                    </span>
                  </td>
                  <td className="px-8 py-8">
                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                      {key.providerRouting.map((route) => (
                        <span
                          key={`${key.id}-${route.provider}`}
                          className={`text-[9px] px-2 py-0.5 rounded border font-bold tracking-widest ${
                            route.scope === 'PER_SEAT'
                              ? 'bg-primary/15 text-primary border-primary/30'
                              : route.scope === 'SHARED'
                                ? 'bg-white/10 text-on-surface-variant border-white/10'
                                : 'bg-error/10 text-error border-error/20'
                          }`}
                        >
                          {route.provider}:{route.scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-8 py-8 max-w-[200px]">
                    <span className="text-[10px] font-mono text-on-surface-variant break-all">
                      {key.defaultUpstreamModel ?? '—'}
                    </span>
                  </td>
                  <td className="px-8 py-8 text-right">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                      <button
                        type="button"
                        aria-label={`Set gateway model for key ${key.keyPrefix}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setGatewayModelKey(key);
                          setGatewayModelDraft(key.defaultUpstreamModel ?? '');
                        }}
                        disabled={key.status !== 'ACTIVE' && key.status !== 'ROTATING'}
                        className="p-2 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-primary rounded-lg transition-all disabled:opacity-20 disabled:pointer-events-none"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Rotate key ${key.keyPrefix}`}
                        onClick={(e) => { e.stopPropagation(); setRotateConfirm(key); }}
                        disabled={key.status !== 'ACTIVE'}
                        className="p-2 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-primary rounded-lg transition-all disabled:opacity-20 disabled:pointer-events-none"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Revoke key ${key.keyPrefix}`}
                        onClick={(e) => { e.stopPropagation(); setRevokeConfirm(key); }}
                        disabled={key.status === 'REVOKED'}
                        className="p-2 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-error rounded-lg transition-all disabled:opacity-20 disabled:pointer-events-none"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredKeys.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-8 py-14 text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                    No access keys match the current query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate Key Modal */}
      <AnimatePresence>
        {isGenerateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !generatedKey && setIsGenerateModalOpen(false)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-panel p-8 rounded-3xl border-primary/20 accent-border shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight">Issue Internal Token</h2>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-1 italic">Protocol Layer-7 Authorization</p>
                </div>
                {!generatedKey && (
                  <button type="button" onClick={() => setIsGenerateModalOpen(false)} className="text-on-surface-variant hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {!generatedKey ? (
                <div className="space-y-6">
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex gap-4">
                    <ShieldAlert className="text-primary w-6 h-6 flex-shrink-0" />
                    <p className="text-[11px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-wide">
                      Generating a new key will grant immediate access to internal AIHub services.
                      Ensure the receiving node is configured with the latest encryption standards.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50 ml-1">Select Identity Designation</label>
                    <input
                      type="text"
                      value={issueUserId}
                      onChange={(e) => setIssueUserId(e.target.value)}
                      placeholder="User ID (UUID)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold tracking-widest focus:border-primary/40 focus:ring-0 transition-all"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => issueKey.mutate(issueUserIdTrimmed)}
                    disabled={!isValidIssueUserId || issueKey.isPending}
                    className="w-full py-4 bg-primary text-on-primary font-black text-[11px] uppercase tracking-[0.3em] rounded-xl shadow-xl hover:brightness-110 active:scale-[0.98] transition-all status-glow disabled:opacity-40 disabled:pointer-events-none"
                  >
                    {issueKey.isPending ? 'Generating...' : 'Generate Secure Hash'}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-6 bg-error/10 border border-error/30 rounded-2xl flex gap-4">
                    <AlertTriangle className="text-error w-8 h-8 flex-shrink-0 animate-pulse" />
                    <div>
                      <p className="text-[11px] font-black text-error leading-relaxed uppercase tracking-tight">
                        Critical Warning: Secret Key Visibility
                      </p>
                      <p className="text-[10px] font-bold text-on-surface-variant opacity-80 mt-1 uppercase leading-tight">
                        This key will NEVER be shown again. Copy it now and store it in a secure vault.
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="w-full bg-surface border-2 border-white/10 rounded-2xl p-6 pr-16 break-all font-mono text-sm text-primary font-bold shadow-inner">
                      {generatedKey}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(generatedKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-primary text-on-primary rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all status-glow"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {copied && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[9px] font-black text-primary text-center uppercase tracking-widest"
                    >
                      Signature Hash Secured to Clipboard
                    </motion.p>
                  )}

                  <button
                    type="button"
                    onClick={() => { setGeneratedKey(null); setIsGenerateModalOpen(false); }}
                    className="w-full py-4 bg-white/5 border border-white/10 text-on-surface font-black text-[11px] uppercase tracking-[0.3em] rounded-xl hover:bg-white/10 transition-all"
                  >
                    I have secured the token
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Revoke Confirmation Modal */}
      <AnimatePresence>
        {revokeConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !revoke.isPending && setRevokeConfirm(null)}
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
                  <h2 className="text-2xl font-black uppercase tracking-tight text-error">Terminate Token?</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mt-1 opacity-60">Impact Analysis Required</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl text-[11px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-wide border border-white/5">
                  Revoking key <span className="text-primary font-mono">{revokeConfirm.keyPrefix}</span> will immediately disconnect all active streams associated with{' '}
                  <span className="text-on-surface">{revokeConfirm.user.fullName}</span>.
                  This operation is <span className="text-error underline">permanent</span>.
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setRevokeConfirm(null)}
                    disabled={revoke.isPending}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
                  >
                    Abort
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke.mutate(revokeConfirm.id)}
                    disabled={revoke.isPending}
                    className="flex-1 py-3 bg-error text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {revoke.isPending ? 'Revoking...' : 'Confirm Purge'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rotate Confirmation Modal */}
      <AnimatePresence>
        {rotateConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !rotate.isPending && setRotateConfirm(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md glass-panel p-8 rounded-3xl border-primary/20 shadow-2xl"
            >
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto border border-primary/20">
                  <RotateCcw className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-primary">Rotate Protocol?</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mt-1 opacity-60">Security Migration Event</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl text-[11px] font-bold text-on-surface-variant leading-relaxed uppercase tracking-wide border border-white/5">
                  Rotating will invalidate the existing token and issue a fallback grace period. New credentials must be generated immediately.
                </div>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setRotateConfirm(null)}
                    disabled={rotate.isPending}
                    className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => rotate.mutate(rotateConfirm.id)}
                    disabled={rotate.isPending}
                    className="flex-1 py-3 bg-primary text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all status-glow disabled:opacity-40"
                  >
                    {rotate.isPending ? 'Rotating...' : 'Initialize Rotation'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Gateway model override (Claude Code → Gemini, etc.) */}
      <AnimatePresence>
        {gatewayModelKey && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !saveGatewayModel.isPending && setGatewayModelKey(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-panel p-8 rounded-3xl border-primary/20 shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight">Gateway model override</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] mt-1 opacity-70">
                    LiteLLM model id for key <span className="text-primary font-mono">{gatewayModelKey.keyPrefix}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !saveGatewayModel.isPending && setGatewayModelKey(null)}
                  className="text-on-surface-variant hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant mb-4 leading-relaxed">
                Claude Code always sends Anthropic-style <code className="text-primary">claude-*</code> model names.
                Set a Gemini (or other) LiteLLM id here so traffic uses your per-seat Google key. Policy{' '}
                <span className="text-on-surface font-semibold">allowed engines</span> must include this exact id (or be empty).
              </p>
              <label className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant opacity-50 ml-1 block mb-2">
                Model id (empty = use client model)
              </label>
              <input
                type="text"
                list="gateway-model-suggestions"
                value={gatewayModelDraft}
                onChange={(e) => setGatewayModelDraft(e.target.value)}
                placeholder="e.g. gemini-2.0-flash"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono focus:border-primary/40 focus:ring-0 transition-all mb-2"
              />
              <datalist id="gateway-model-suggestions">
                {POLICY_MODEL_IDS_FLAT.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="text-[9px] text-on-surface-variant opacity-60 mb-6">
                There is no <code className="text-on-surface">gemini-3-flash</code> id in LiteLLM; use names such as{' '}
                <code className="text-primary">gemini-2.0-flash</code> unless your provider documents otherwise.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => !saveGatewayModel.isPending && setGatewayModelKey(null)}
                  className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saveGatewayModel.isPending}
                  onClick={() =>
                    saveGatewayModel.mutate({
                      id: gatewayModelKey.id,
                      model: gatewayModelDraft.trim() === '' ? null : gatewayModelDraft.trim(),
                    })}
                  className="flex-1 py-3 bg-primary text-on-primary font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 disabled:opacity-40"
                >
                  {saveGatewayModel.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Usage History Modal */}
      <AnimatePresence>
        {usageHistoryKey && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setUsageHistoryKey(null)}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl glass-panel p-8 rounded-[2rem] border-primary/20 accent-border shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <History className="w-5 h-5 text-primary" />
                    <h2 className="text-2xl font-black uppercase tracking-tight">Signal Usage Record</h2>
                  </div>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] opacity-60">
                    Audit log for token: <span className="text-primary font-mono">{usageHistoryKey.keyPrefix}...</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUsageHistoryKey(null)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-1">Total Hits (24h)</p>
                    <p className="text-xl font-black text-on-surface">1,242</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-1">Success Rate</p>
                    <p className="text-xl font-black text-primary">98.4%</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-1">Compute Cost</p>
                    <p className="text-xl font-black text-on-surface">$12.45</p>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl overflow-x-auto border border-white/5 bg-[#0a0a0a]/50">
                  <table className="w-full text-left min-w-[600px]">
                    <thead>
                      <tr className="bg-white/5">
                        <th scope="col" className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Timestamp</th>
                        <th scope="col" className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Module/Path</th>
                        <th scope="col" className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-50">Status</th>
                        <th scope="col" className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-50 text-right">Payload</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {usageHistoryQuery.isLoading ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-[9px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                            Loading...
                          </td>
                        </tr>
                      ) : (usageHistoryQuery.data ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-[9px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                            No usage events in the last 7 days.
                          </td>
                        </tr>
                      ) : (usageHistoryQuery.data ?? []).map((log, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 font-mono text-[9px] text-on-surface-variant">{log.timestamp}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-on-surface uppercase tracking-tight">{log.endpoint}</span>
                              <span className="text-[8px] text-primary font-mono opacity-60">{log.model}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${log.status === 'SUCCESS' ? 'bg-primary/20 text-primary' : 'bg-error/20 text-error'}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-[9px] font-mono text-on-surface-variant opacity-40">{log.tokens > 0 ? `${log.tokens} tk` : '--'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center gap-4">
                  <Terminal className="text-primary w-5 h-5" />
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest italic">
                    Historical events synchronized with central logging telemetry.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {revealedKey && <KeyRevealModal apiKey={revealedKey} onClose={() => setRevealedKey(null)} />}
    </div>
  );
}

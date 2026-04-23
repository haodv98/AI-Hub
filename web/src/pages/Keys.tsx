/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KeyRevealModal } from '@/components/keys/KeyRevealModal';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { SegmentedFilterButton } from '@/components/atoms/SegmentedFilterButton';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';

interface ApiKey {
  id: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  user: { fullName: string; email: string };
  providerRouting: Array<{
    provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE';
    scope: 'PER_SEAT' | 'SHARED' | 'NONE';
    source: 'per-seat' | 'shared' | 'unconfigured';
  }>;
}

interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    pagination?: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function useKeys() {
  return useQuery<PaginatedResponse<ApiKey>>({
    queryKey: ['keys'],
    queryFn: () => api.get('/keys').then((r) => r.data),
  });
}

export default function Keys() {
  const qc = useQueryClient();
  const { data: keysResponse, isLoading, isError } = useKeys();
  const [issueUserId, setIssueUserId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showIssueHint, setShowIssueHint] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const revoke = useMutation({
    mutationFn: async (id: string) => api.post(`/keys/${id}/revoke`),
    onMutate: () => {
      setMutationError(null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setRevokeTarget(null);
    },
    onError: () => {
      setMutationError('Failed to revoke key. Please retry.');
    },
  });

  const rotate = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/keys/${id}/rotate`);
      const plaintext = response.data?.data?.plaintext;
      if (typeof plaintext !== 'string') {
        throw new Error('Missing plaintext in rotation response');
      }
      return plaintext;
    },
    onMutate: (id: string) => {
      setMutationError(null);
      setRotatingId(id);
    },
    onSuccess: (plaintext) => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setRevealedKey(plaintext);
      setRotatingId(null);
    },
    onError: () => {
      setMutationError('Failed to rotate key. Please retry.');
      setRotatingId(null);
    },
  });

  const filteredKeys =
    (keysResponse?.data ?? []).filter((key) => {
      const userName = key.user?.fullName ?? '';
      const keyPrefix = key.keyPrefix ?? '';
      const matchesSearch =
        userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        keyPrefix.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || key.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

  const issueKey = useMutation({
    mutationFn: async (userId: string) => {
      setMutationError(null);
      const response = await api.post(`/keys?userId=${encodeURIComponent(userId)}`);
      const plaintext = response.data?.data?.plaintext;
      if (typeof plaintext !== 'string') {
        throw new Error('Missing plaintext in issue key response');
      }
      return plaintext;
    },
    onSuccess: (plaintext) => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setRevealedKey(plaintext);
      setIssueUserId('');
      setShowIssueHint(false);
    },
    onError: () => {
      setMutationError('Failed to issue key. Please verify userId and retry.');
    },
  });

  const issueUserIdTrimmed = issueUserId.trim();
  const isValidIssueUserId = UUID_REGEX.test(issueUserIdTrimmed);
  const totalKeys = keysResponse?.meta?.pagination?.total ?? (keysResponse?.data ?? []).length;
  const activeKeys = (keysResponse?.data ?? []).filter((key) => key.status === 'ACTIVE').length;
  const revokedKeys = (keysResponse?.data ?? []).filter((key) => key.status === 'REVOKED').length;

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-5xl font-black text-on-surface tracking-tighter uppercase">
            Internal <span className="text-primary opacity-80">Access Keys</span>
          </h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Manage high-level authorization tokens for internal node communication. All keys are encrypted at rest and logged on every invocation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowIssueHint((prev) => !prev)}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
        >
          <Plus className="w-4 h-4" /> Issue New Token
        </button>
      </div>

      {showIssueHint && (
        <div className="glass-panel p-4 rounded-2xl space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-70">
            Issue a new internal key for a user by entering user id.
          </p>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={issueUserId}
              onChange={(event) => setIssueUserId(event.target.value)}
              placeholder="User ID (UUID)"
              className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-xs font-bold tracking-widest uppercase flex-1"
            />
            <button
              type="button"
              onClick={() => issueKey.mutate(issueUserIdTrimmed)}
              disabled={!isValidIssueUserId || issueKey.isPending}
              className="px-6 py-3 rounded-xl bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest disabled:opacity-40"
            >
              {issueKey.isPending ? 'Issuing...' : 'Issue Key'}
            </button>
          </div>
        </div>
      )}

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

      <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-70">
        LiteLLM does not create user keys in its database for this flow. Gateway resolves provider keys from Vault:
        <span className="text-primary"> PER_SEAT first, fallback to SHARED</span>.
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
            onChange={(event) => setSearchTerm(event.target.value)}
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
        <TableSkeleton rows={6} cols={6} />
      ) : (
        <div className="glass-panel rounded-3xl overflow-x-auto border border-white/5">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="bg-white/5">
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Token Designation</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Authorized User</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Security Status</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Calibrated</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Last Signal</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Provider Routing</th>
                <th scope="col" className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredKeys.map((key) => (
                <tr key={key.id} className="group hover:bg-white/5 transition-all duration-300">
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
                  <td className="px-8 py-8 text-right">
                    <div className="flex items-center justify-end gap-3 transition-all translate-x-2 group-hover:translate-x-0">
                      <button
                        type="button"
                        aria-label={`Rotate key ${key.keyPrefix}`}
                        onClick={() => rotate.mutate(key.id)}
                        disabled={key.status !== 'ACTIVE' || rotatingId === key.id}
                        className="p-2 bg-white/5 hover:bg-white/10 text-on-surface-variant hover:text-primary rounded-lg transition-all disabled:opacity-20 disabled:pointer-events-none"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Revoke key ${key.keyPrefix}`}
                        onClick={() => setRevokeTarget(key.id)}
                        disabled={key.status === 'REVOKED' || revoke.isPending}
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
                  <td colSpan={7} className="px-8 py-14 text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                    No access keys match the current query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Terminate Token?"
        description="This will immediately invalidate the key. Any integrations using it will stop working."
        confirmLabel={revoke.isPending ? 'Revoking...' : 'Confirm Purge'}
        destructive
        onConfirm={() => revokeTarget && revoke.mutate(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
      />

      {revealedKey && <KeyRevealModal apiKey={revealedKey} onClose={() => setRevealedKey(null)} />}
    </div>
  );
}

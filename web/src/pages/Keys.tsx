import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { KeyRevealModal } from '@/components/keys/KeyRevealModal';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { formatDate } from '@/lib/utils';
import api from '@/lib/api';

interface ApiKey {
  id: string;
  keyPrefix: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  user: { fullName: string; email: string };
}

function useKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => api.get('/keys').then((r) => r.data.data),
  });
}

export default function Keys() {
  const qc = useQueryClient();
  const { data: keys, isLoading } = useKeys();
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setRevokeTarget(null);
    },
  });

  const rotate = useMutation({
    mutationFn: (id: string) =>
      api.post(`/keys/${id}/rotate`).then((r) => r.data.data.plaintext as string),
    onSuccess: (plaintext) => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setRevealedKey(plaintext);
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">API Keys</h1>

      {isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Key prefix
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last used</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys?.map((key) => (
                <tr key={key.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{key.user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{key.user.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{key.keyPrefix}…</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={key.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => rotate.mutate(key.id)}
                        disabled={key.status !== 'ACTIVE'}
                        className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Rotate
                      </button>
                      <button
                        onClick={() => setRevokeTarget(key.id)}
                        disabled={key.status === 'REVOKED'}
                        className="text-xs text-rose-600 hover:text-rose-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke API key"
        description="This will immediately invalidate the key. Any integrations using it will stop working."
        confirmLabel="Revoke key"
        destructive
        onConfirm={() => revokeTarget && revoke.mutate(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
      />

      {revealedKey && <KeyRevealModal apiKey={revealedKey} onClose={() => setRevealedKey(null)} />}
    </div>
  );
}

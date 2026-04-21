import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import api from '@/lib/api';

interface Member {
  id: string;
  email: string;
  fullName: string;
  status: string;
  role: string;
  teamMembers: Array<{ team: { id: string; name: string }; tier: string }>;
}

const TIERS = ['MEMBER', 'SENIOR', 'LEAD'] as const;
type Tier = (typeof TIERS)[number];

function useMembers(search: string) {
  return useQuery<Member[]>({
    queryKey: ['members', search],
    queryFn: () =>
      api
        .get('/users', { params: { limit: 100, ...(search ? { search } : {}) } })
        .then((r) => r.data.data ?? []),
  });
}

export default function Members() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [offboardTarget, setOffboardTarget] = useState<string | null>(null);
  const [tierTarget, setTierTarget] = useState<{ memberId: string; teamId: string; currentTier: string } | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier>('MEMBER');

  const { data: members, isLoading } = useMembers(search);

  const offboard = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/offboard`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setOffboardTarget(null);
    },
  });

  const changeTier = useMutation({
    mutationFn: ({ memberId, teamId, tier }: { memberId: string; teamId: string; tier: Tier }) =>
      api.put(`/teams/${teamId}/members/${memberId}/tier`, { tier }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setTierTarget(null);
    },
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Team / Tier</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members?.map((member) => {
                const primaryTeam = member.teamMembers[0];
                return (
                  <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {primaryTeam ? (
                        <span>
                          {primaryTeam.team.name}
                          <span className="ml-1.5 text-xs">· {primaryTeam.tier.toLowerCase()}</span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs uppercase tracking-wide">
                      {member.role.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={member.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/members/${member.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </Link>
                        {primaryTeam && member.status === 'ACTIVE' && (
                          <button
                            onClick={() => {
                              setTierTarget({
                                memberId: member.id,
                                teamId: primaryTeam.team.id,
                                currentTier: primaryTeam.tier,
                              });
                              setSelectedTier(primaryTeam.tier as Tier);
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Change tier
                          </button>
                        )}
                        {member.status !== 'OFFBOARDED' && (
                          <button
                            onClick={() => setOffboardTarget(member.id)}
                            className="text-xs text-rose-600 hover:text-rose-800"
                          >
                            Offboard
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {members?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {search ? `No members matching "${search}"` : 'No members yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tier change dialog */}
      {tierTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-base font-semibold mb-4">Change tier</h2>
            <div className="space-y-2 mb-5">
              {TIERS.map((tier) => (
                <label key={tier} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="tier"
                    value={tier}
                    checked={selectedTier === tier}
                    onChange={() => setSelectedTier(tier)}
                    className="accent-primary"
                  />
                  <span className="text-sm capitalize">{tier.toLowerCase()}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setTierTarget(null)}
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  changeTier.mutate({
                    memberId: tierTarget.memberId,
                    teamId: tierTarget.teamId,
                    tier: selectedTier,
                  })
                }
                disabled={selectedTier === tierTarget.currentTier || changeTier.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {changeTier.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={offboardTarget !== null}
        title="Offboard member"
        description="This will revoke all API keys and deactivate the account. This action cannot be undone."
        confirmLabel="Offboard"
        destructive
        onConfirm={() => offboardTarget && offboard.mutate(offboardTarget)}
        onCancel={() => setOffboardTarget(null)}
      />
    </div>
  );
}

/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
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
  const [csvText, setCsvText] = useState('');

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

  const importPerSeatKeys = useMutation({
    mutationFn: (csv: string) => api.post('/users/provider-keys/import', { csv }),
    onSuccess: () => {
      setCsvText('');
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const filteredMembers = members ?? [];

  return (
    <div className="space-y-12">
      <div className="flex justify-between items-end">
        <div className="space-y-3">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black tracking-tighter text-on-surface uppercase"
          >
            Personnel <span className="text-primary opacity-80">Registry</span>
          </motion.h2>
          <p className="text-on-surface-variant font-bold text-xs tracking-[0.3em] uppercase opacity-50 italic">
            Sector Oversight // Access Level Authorization
          </p>
        </div>
        <button
          type="button"
          className="bg-primary hover:bg-primary-dim text-on-primary px-8 py-4 rounded-xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 flex items-center gap-2 status-glow"
        >
          <UserPlus className="w-4 h-4" /> Authorize Entry
        </button>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h2 className="text-sm font-semibold mb-2">Import PER_SEAT keys (CSV)</h2>
        <p className="text-xs text-muted-foreground mb-3">Header: email,provider,api_key</p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={5}
          placeholder="email,provider,api_key&#10;dev@company.com,anthropic,sk-ant-xxx"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => importPerSeatKeys.mutate(csvText)}
            disabled={!csvText.trim() || importPerSeatKeys.isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {importPerSeatKeys.isPending ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 glass-panel p-4 rounded-xl flex items-center gap-3 border-white/10 focus-within:border-primary/40 transition-all">
          <Search className="text-primary w-4 h-4 ml-2" />
          <label htmlFor="members-search" className="sr-only">Search members</label>
          <input
            id="members-search"
            type="search"
            placeholder="Query personnel by designation, stream, or sector ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant placeholder:opacity-40"
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <div className="glass-panel rounded-3xl overflow-x-auto">
          <table className="w-full min-w-[920px] text-left border-collapse">
            <thead>
              <tr className="bg-white/5">
                <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50">Designation</th>
                <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50">Assigned Unit</th>
                <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50">Protocol Role</th>
                <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50 text-center">Security Status</th>
                <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50">Last Signal</th>
                <th scope="col" className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-50 text-right">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y-0">
              {filteredMembers.map((member) => {
                const primaryTeam = member.teamMembers[0];
                const initials = member.fullName
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                const activity = member.status === 'ACTIVE' ? '45m ago' : member.status === 'OFFBOARDED' ? 'Inactive' : '12d ago';
                return (
                  <tr key={member.id} className="group hover:bg-white/5 transition-all cursor-crosshair border-b border-white/5">
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-primary">
                          {initials}
                        </div>
                        <div>
                          <div className="text-xs font-black text-on-surface uppercase tracking-wider">{member.fullName}</div>
                          <div className="text-[10px] text-primary font-mono mt-1 opacity-60">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <span className="text-[10px] font-bold text-on-surface uppercase tracking-widest opacity-80">
                        {primaryTeam ? primaryTeam.team.name : 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-6 py-6">
                      <span className="text-[9px] font-black tracking-widest text-on-surface-variant border border-white/5 px-2 py-1 uppercase bg-white/5 rounded">
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-6 text-center">
                      <StatusBadge status={member.status} />
                    </td>
                    <td className="px-6 py-6">
                      <span className="text-[10px] font-mono text-on-surface-variant opacity-60">{activity}</span>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all translate-x-0 md:translate-x-2 md:group-hover:translate-x-0">
                        {primaryTeam && member.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => {
                              setTierTarget({
                                memberId: member.id,
                                teamId: primaryTeam.team.id,
                                currentTier: primaryTeam.tier,
                              });
                              setSelectedTier(primaryTeam.tier as Tier);
                            }}
                            className="text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-white/10 rounded-lg hover:text-primary transition-colors"
                          >
                            Tier
                          </button>
                        )}
                        <Link to={`/members/${member.id}`} className="text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-white/10 rounded-lg hover:text-primary transition-colors">
                          Audit
                        </Link>
                        {member.status !== 'OFFBOARDED' && (
                          <button
                            type="button"
                            onClick={() => setOffboardTarget(member.id)}
                            className="text-[9px] font-black uppercase tracking-widest px-3 py-1 bg-white/10 rounded-lg hover:text-primary transition-colors text-error"
                          >
                            Purge
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {search ? `No members matching "${search}"` : 'No members yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center opacity-40">
        <span className="text-[9px] font-black uppercase tracking-[0.3em]">
          Signal locked: {filteredMembers.length} identified
        </span>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous page" className="w-8 h-8 flex items-center justify-center glass-panel rounded hover:text-primary">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" aria-current="page" aria-label="Page 1" className="px-3 h-8 glass-panel rounded font-bold text-[9px] text-primary">01</button>
          <button type="button" aria-label="Page 2" className="px-3 h-8 glass-panel rounded font-bold text-[9px] opacity-40 hover:opacity-100">02</button>
          <button type="button" aria-label="Next page" className="w-8 h-8 flex items-center justify-center glass-panel rounded hover:text-primary">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tier change dialog */}
      {tierTarget && (
        <div role="dialog" aria-modal="true" aria-labelledby="tier-dialog-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-xl">
            <h2 id="tier-dialog-title" className="text-base font-semibold mb-4">Change tier</h2>
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

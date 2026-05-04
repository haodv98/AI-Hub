/* eslint-disable react/react-in-jsx-scope */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, ChevronLeft, ChevronRight, X, Upload, ToggleRight, ToggleLeft, Image as ImageIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { useAuth } from '@/contexts/AuthContext';
import { getPaginatedEnvelope, postEnvelope, putEnvelope } from '@/lib/api';
import { canUseCapability } from '@/lib/capabilities';
import { useGlobalUi } from '@/contexts/GlobalUiContext';
import { formatRelativeShort } from '@/lib/utils';

interface Member {
  id: string;
  email: string;
  fullName: string;
  status: string;
  role: string;
  updatedAt: string;
  teamMembers: Array<{ team: { id: string; name: string }; tier: string }>;
  /** Newest active key lastUsedAt (server sends at most one row for list perf). */
  apiKeys?: Array<{ lastUsedAt: string | null }>;
}

const TIERS = ['MEMBER', 'SENIOR', 'LEAD'] as const;
type Tier = (typeof TIERS)[number];

function useMembers(search: string, page: number, limit: number) {
  return useQuery<{ rows: Member[]; pages: number }>({
    queryKey: ['members', search, page, limit],
    queryFn: async () => {
      const { data, pagination } = await getPaginatedEnvelope<Member[]>('/users', {
        page,
        limit,
        ...(search ? { search } : {}),
      });
      return { rows: data ?? [], pages: pagination?.pages ?? 1 };
    },
  });
}

export default function Members() {
  const qc = useQueryClient();
  const { isAdmin, isTeamLead } = useAuth();
  const role = { isAdmin, isTeamLead };
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const [offboardTarget, setOffboardTarget] = useState<string | null>(null);
  const [tierTarget, setTierTarget] = useState<{ memberId: string; teamId: string; currentTier: string } | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier>('MEMBER');
  const [csvText, setCsvText] = useState('');
  const [isNewMemberModalOpen, setIsNewMemberModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('');
  const [newMemberTeam, setNewMemberTeam] = useState('');
  const [newMemberAvatar, setNewMemberAvatar] = useState('');
  const [newMemberIsActive, setNewMemberIsActive] = useState(true);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const { pushToast } = useGlobalUi();

  const membersQuery = useMembers(search, page, limit);
  const members = membersQuery.data?.rows ?? [];

  const offboard = useMutation({
    mutationFn: (id: string) => postEnvelope(`/users/${id}/offboard`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setOffboardTarget(null);
      setMutationError(null);
      pushToast('Transmission', 'Member offboarded');
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to offboard member.');
    },
  });

  const changeTier = useMutation({
    mutationFn: ({ memberId, teamId, tier }: { memberId: string; teamId: string; tier: Tier }) =>
      putEnvelope(`/teams/${teamId}/members/${memberId}/tier`, { tier }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setTierTarget(null);
      setMutationError(null);
      pushToast('Transmission', 'Tier updated');
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to change tier.');
    },
  });

  const importPerSeatKeys = useMutation({
    mutationFn: (csv: string) => postEnvelope('/users/provider-keys/import', { csv }),
    onSuccess: () => {
      setCsvText('');
      qc.invalidateQueries({ queryKey: ['members'] });
      setMutationError(null);
      pushToast('Transmission', 'CSV imported');
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to import provider keys.');
    },
  });

  const createMember = useMutation({
    mutationFn: () =>
      postEnvelope('/users', {
        fullName: newMemberName.trim(),
        email: newMemberEmail.trim(),
      }),
    onSuccess: () => {
      setIsNewMemberModalOpen(false);
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberRole('');
      setNewMemberTeam('');
      setNewMemberAvatar('');
      setNewMemberIsActive(true);
      qc.invalidateQueries({ queryKey: ['members'] });
      setMutationError(null);
      pushToast('Transmission', 'Member onboarded');
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to create member.');
    },
  });

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newMemberEmail.trim());
  const filteredMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.fullName.toLowerCase().includes(search.toLowerCase()) ||
          member.email.toLowerCase().includes(search.toLowerCase()),
      ),
    [members, search],
  );

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
        {canUseCapability(role, 'members.create') && (
          <div className="flex gap-4">
            {canUseCapability(role, 'members.importProviderKeys') && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="bg-white/5 hover:bg-white/10 text-on-surface px-6 py-4 rounded-xl text-[11px] font-bold uppercase tracking-[0.2em] border border-white/10 transition-all active:scale-95 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Import CSV
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsNewMemberModalOpen(true)}
              className="w-full md:w-auto bg-primary hover:bg-primary-dim text-on-primary px-8 py-4 rounded-xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 flex items-center gap-2 status-glow"
            >
              <UserPlus className="w-4 h-4" /> Authorize Entry
            </button>
          </div>
        )}
      </div>

      {mutationError && <ErrorPanel message={mutationError} onRetry={() => setMutationError(null)} />}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 glass-panel p-4 rounded-xl flex items-center gap-3 border-white/10 focus-within:border-primary/40 transition-all">
          <Search className="text-primary w-4 h-4 ml-2" />
          <label htmlFor="members-search" className="sr-only">Search members</label>
          <input
            id="members-search"
            type="search"
            placeholder="Query personnel by designation, stream, or sector ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant placeholder:opacity-40"
          />
        </div>
      </div>

      {membersQuery.isError && <ErrorPanel message="Failed to load members." onRetry={() => membersQuery.refetch()} />}

      {membersQuery.isLoading ? (
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
                const initials = member.fullName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
                const lastKeyUse = member.apiKeys?.[0]?.lastUsedAt ?? null;
                const activity =
                  member.status === 'OFFBOARDED'
                    ? 'Offboarded'
                    : lastKeyUse
                      ? formatRelativeShort(lastKeyUse)
                      : formatRelativeShort(member.updatedAt);
                return (
                  <tr key={member.id} className="group hover:bg-white/5 transition-all cursor-crosshair border-b border-white/5">
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-black text-primary shadow-xl"
                          aria-hidden
                        >
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
                      <span
                        className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-[0.1em] ${
                          member.status === 'ACTIVE'
                            ? 'bg-primary/10 text-primary border border-primary/20 status-glow'
                            : member.status === 'SUSPENDED'
                              ? 'bg-error/10 text-error border border-error/20'
                              : 'bg-white/5 text-on-surface-variant opacity-40'
                        }`}
                      >
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-6">
                      <span className="text-[10px] font-mono text-on-surface-variant opacity-60">{activity}</span>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all translate-x-0 md:translate-x-2 md:group-hover:translate-x-0">
                        {canUseCapability(role, 'teams.changeTier') && primaryTeam && member.status === 'ACTIVE' && (
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
                        {canUseCapability(role, 'members.offboard') && member.status !== 'OFFBOARDED' && (
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
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <EmptyState message={search ? `No members matching "${search}"` : 'No members yet'} />
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
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="w-8 h-8 flex items-center justify-center glass-panel rounded hover:text-primary disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" aria-current="page" aria-label={`Page ${page}`} className="px-3 h-8 glass-panel rounded font-bold text-[9px] text-primary">
            {String(page).padStart(2, '0')}
          </button>
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= (membersQuery.data?.pages ?? 1)}
            onClick={() => setPage((prev) => prev + 1)}
            className="w-8 h-8 flex items-center justify-center glass-panel rounded hover:text-primary disabled:opacity-40"
          >
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

      <AnimatePresence>
        {isNewMemberModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsNewMemberModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-xl glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <UserPlus className="w-48 h-48 text-primary" />
              </div>
              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-on-surface tracking-tighter uppercase">Onboard New <span className="text-primary">Member</span></h3>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] opacity-40">Initialize personnel credentials and access level</p>
                </div>
                <button onClick={() => setIsNewMemberModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-white transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-6">
                <div className="flex gap-6 items-center">
                  <div className="w-20 h-20 rounded-2xl bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center text-on-surface-variant overflow-hidden">
                    {newMemberAvatar ? <img src={newMemberAvatar} className="w-full h-full object-cover" alt="" /> : <><ImageIcon className="w-6 h-6 mb-1 opacity-40" /><span className="text-[8px] font-black uppercase tracking-widest leading-none">Avatar</span></>}
                  </div>
                  <div className="flex-1 space-y-4">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Full Designation</label>
                    <input type="text" placeholder="e.g. Alex Rivera" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all" value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Signal Stream [Email]</label>
                    <input type="email" placeholder="alex.rivera@aihub.internal" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all font-mono" value={newMemberEmail} onChange={(event) => setNewMemberEmail(event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Protocol Role</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all appearance-none cursor-pointer"
                      value={newMemberRole}
                      onChange={(event) => setNewMemberRole(event.target.value)}
                    >
                      <option value="" className="bg-surface">Select Role</option>
                      <option value="TAC_LEAD" className="bg-surface">TAC_LEAD</option>
                      <option value="NAV_OFFICER" className="bg-surface">NAV_OFFICER</option>
                      <option value="DEFENSE" className="bg-surface">DEFENSE</option>
                      <option value="OPERATOR" className="bg-surface">OPERATOR</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Assigned Unit [Optional]</label>
                    <input type="text" placeholder="Fleet-Command" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all" value={newMemberTeam} onChange={(event) => setNewMemberTeam(event.target.value)} />
                  </div>
                  <div className="space-y-1 flex flex-col justify-end">
                    <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Security Status</span>
                      <button onClick={() => setNewMemberIsActive((prev) => !prev)} className={`transition-all ${newMemberIsActive ? 'text-primary' : 'text-on-surface-variant opacity-20'}`}>{newMemberIsActive ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}</button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsNewMemberModalOpen(false)} className="flex-1 py-4 glass-panel rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/5 transition-all text-on-surface-variant">Abort Onboarding</button>
                  <button onClick={() => createMember.mutate()} disabled={!newMemberName.trim() || !isValidEmail || createMember.isPending} className="flex-1 py-4 bg-primary text-on-primary rounded-xl text-[10px] font-black uppercase tracking-[0.3em] shadow-lg status-glow active:scale-95 transition-all disabled:opacity-50">
                    {createMember.isPending ? 'Finalizing...' : 'Finalize Entry'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsImportModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-xl glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Upload className="w-48 h-48 text-primary" />
              </div>
              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-on-surface tracking-tighter uppercase">Bulk Member <span className="text-primary">Extraction</span></h3>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] opacity-40">Import secondary personnel via CSV matrix</p>
                </div>
                <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-white transition-all"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60">CSV Schema Protocol</label>
                    <span className="text-[8px] font-mono text-primary uppercase opacity-60">email, role, team, full_name</span>
                  </div>
                  <textarea
                    className="w-full bg-white/2 border border-white/10 rounded-2xl p-6 h-64 text-[10px] font-mono text-primary placeholder:text-on-surface-variant/20 focus:border-primary/40 transition-all resize-none shadow-inner"
                    placeholder={"sarah.chen@aihub.internal, NAV_OFFICER, Neural-Ops, Sarah Chen\nalex.rivera@aihub.internal, TAC_LEAD, Fleet-Command, Alex Rivera"}
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                  />
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex gap-4">
                  <div className="w-1 bg-primary/40 rounded-full flex-shrink-0" />
                  <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed">
                    Personnel data is processed through validation nodes. Incorrect formatting will lead to record rejection.
                    Ensure all signals match corporate ID standards.
                  </p>
                </div>
                <div className="flex gap-4 pt-2">
                  <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 glass-panel rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/5 transition-all text-on-surface-variant">Abort Extraction</button>
                  <button onClick={() => importPerSeatKeys.mutate(csvText)} disabled={!csvText.trim() || importPerSeatKeys.isPending} className="flex-1 py-4 bg-primary text-on-primary rounded-xl text-[10px] font-black uppercase tracking-[0.3em] shadow-lg status-glow active:scale-95 transition-all disabled:opacity-50">
                    {importPerSeatKeys.isPending ? 'Injecting...' : 'Inject CSV Personnel'}
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

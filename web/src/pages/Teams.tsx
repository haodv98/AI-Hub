/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, Zap, X, UserPlus, Users, Shield, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';
import { formatUsd } from '@/lib/utils';
import { getEnvelope, getPaginatedEnvelope, postEnvelope } from '@/lib/api';
import { useGlobalUi } from '@/contexts/GlobalUiContext';
import { useAuth } from '@/contexts/AuthContext';
import { canUseCapability } from '@/lib/capabilities';

interface Team {
  id: string;
  name: string;
  description: string | null;
  monthlyBudgetUsd: number;
  _count?: { members: number };
}

interface TeamUsage {
  teamId: string;
  spendUsd: number;
  utilizationPct: number;
  members: number;
}

interface UsageSummary {
  teamUsage: TeamUsage[];
}

const TEAMS_PAGE_SIZE = 20;

function useTeams(page: number, search: string) {
  return useQuery({
    queryKey: ['teams', page, search],
    queryFn: () => getPaginatedEnvelope<Team[]>('/teams', { page, limit: TEAMS_PAGE_SIZE, search: search || undefined }),
  });
}

function useTeamUsageSummary() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  // Format dates once for query key (YYYY-MM-DD format is stable within same month)
  const fromDateStr = from.toISOString().split('T')[0];
  const toDateStr = to.toISOString().split('T')[0];
  return useQuery<UsageSummary>({
    queryKey: ['usage', 'summary', 'team-usage', fromDateStr, toDateStr],
    queryFn: () => getEnvelope<UsageSummary>('/usage/summary', { from: fromDateStr, to: toDateStr }),
  });
}

interface PickerUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
}

function useUserPicker(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'picker', search],
    queryFn: () => getPaginatedEnvelope<PickerUser[]>('/users', { page: 1, limit: 30, search: search.trim() || undefined }),
    enabled,
  });
}

export default function Teams() {
  const queryClient = useQueryClient();
  const { isAdmin, isTeamLead } = useAuth();
  const role = { isAdmin, isTeamLead };
  const [isNewTeamModalOpen, setIsNewTeamModalOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamBudget, setTeamBudget] = useState(5000);
  const [teamPriority, setTeamPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addMemberTier, setAddMemberTier] = useState<'MEMBER' | 'SENIOR' | 'LEAD'>('MEMBER');
  const [memberToSearch, setMemberToSearch] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [teamsPage, setTeamsPage] = useState(1);
  const [teamsSearch] = useState('');
  const { pushToast } = useGlobalUi();
  const { data: teamsResult, isLoading, isError } = useTeams(teamsPage, teamsSearch);
  const { data: usageSummary } = useTeamUsageSummary();
  const userPicker = useUserPicker(memberToSearch, isAddMemberModalOpen && !!selectedTeamId);
  const pickerUsers = userPicker.data?.data ?? [];
  const usageByTeamId = new Map((usageSummary?.teamUsage ?? []).map((row) => [row.teamId, row]));
  const teams = teamsResult?.data ?? [];
  const teamsTotalPages = Math.ceil((teamsResult?.pagination?.total ?? 0) / TEAMS_PAGE_SIZE);

  const addTeamMember = useMutation({
    mutationFn: () =>
      postEnvelope(`/teams/${selectedTeamId}/members`, { userId: selectedUserId!, tier: addMemberTier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setIsAddMemberModalOpen(false);
      setSelectedTeamId(null);
      setSelectedUserId(null);
      setMemberToSearch('');
      setMutationError(null);
      pushToast('Transmission', 'Member added to unit');
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to add member.');
    },
  });

  const createTeam = useMutation({
    mutationFn: () =>
      postEnvelope('/teams', {
        name: teamName.trim(),
        description: teamDescription.trim() || undefined,
        monthlyBudgetUsd: teamBudget,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamsPage, teamsSearch] });
      setIsNewTeamModalOpen(false);
      setTeamName('');
      setTeamDescription('');
      setTeamBudget(5000);
      setTeamCode('');
      setMutationError(null);
      pushToast('Transmission', 'Team deployed successfully');
    },
    onError: (error) => {
      setMutationError(error instanceof Error ? error.message : 'Failed to deploy unit.');
    },
  });

  const mappedTeams = (teams ?? []).map((team) => {
    const usage = usageByTeamId.get(team.id);
    const utilization = usage?.utilizationPct ?? null;
    const spend = usage?.spendUsd ?? null;
    return {
      id: team.id,
      name: team.name,
      code: `TAC-UNIT-${team.id.slice(0, 6).toUpperCase()}`,
      members: usage?.members ?? team._count?.members ?? 0,
      cap: formatUsd(team.monthlyBudgetUsd),
      spend: spend === null ? 'N/A' : formatUsd(spend),
      util: utilization,
      color: utilization !== null && utilization > 90 ? 'error' : 'primary',
      label:
        utilization === null
          ? 'NO DATA'
          : utilization > 90
            ? `${utilization}% CRITICAL`
            : `${utilization}% LOAD`,
    };
  });

  const chartData = mappedTeams.map((team) => ({ name: team.name, val: team.util ?? 0 }));

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black text-on-surface tracking-tighter uppercase"
          >
            Tactical <span className="text-primary opacity-80">Units</span>
          </motion.h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Monitoring planetary AI flux and personnel allocation. Oversee resource distribution across node clusters.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMutationError(null);
            setIsNewTeamModalOpen(true);
          }}
          className="w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dim text-on-primary font-bold text-[11px] uppercase tracking-[0.2em] rounded-xl shadow-xl active:scale-95 transition-all status-glow"
        >
          <Plus className="w-4 h-4" /> Deploy Unit
        </button>
      </div>

      {isError && (
        <div className="glass-panel p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-error">
          Failed to load teams. Try refreshing or check API connectivity.
        </div>
      )}

      <div className="glass-panel rounded-3xl overflow-hidden md:overflow-visible">
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="bg-white/5">
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Designation</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-center">Personnel</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Credit Cap</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Current Debit</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Resource Util</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Operations</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(isLoading ? [] : mappedTeams).map((team) => (
              <tr key={team.id} className="group hover:bg-white/5 transition-all duration-300">
                <td className="px-8 py-8">
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-on-surface tracking-tight uppercase">{team.name}</span>
                    <span className="text-[10px] text-primary font-mono tracking-widest uppercase mt-1 opacity-70">{team.code}</span>
                  </div>
                </td>
                <td className="px-8 py-8 text-center">
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 text-on-surface font-bold text-xs border border-white/5">
                    {team.members}
                  </span>
                </td>
                <td className="px-8 py-8">
                  <span className="font-mono text-sm font-bold opacity-80">{team.cap}</span>
                </td>
                <td className="px-8 py-8">
                  <span className={`font-mono text-sm font-bold ${team.color === 'error' ? 'text-error' : 'text-primary'}`}>
                    {team.spend}
                  </span>
                </td>
                <td className="px-8 py-8">
                  <div className="w-full max-w-[200px]">
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${team.color === 'error' ? 'text-error' : 'text-primary'}`}>
                        {team.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                      {team.util !== null && (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${team.util}%` }}
                          className={`h-full ${team.color === 'error' ? 'bg-error shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-primary shadow-[0_0_10px_rgba(56,189,248,0.5)]'}`}
                        />
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-8 py-8 text-right">
                  <div className="flex flex-col md:flex-row items-center md:justify-end gap-2 md:gap-3 translate-x-2 group-hover:translate-x-0 opacity-0 group-hover:opacity-100 transition-all w-full md:w-auto">
                    {canUseCapability(role, 'teams.addMember') && (
                      <button
                        type="button"
                        onClick={() => {
                          setMutationError(null);
                          setSelectedTeamId(team.id);
                          setSelectedTeamName(team.name);
                          setSelectedUserId(null);
                          setMemberToSearch('');
                          setIsAddMemberModalOpen(true);
                        }}
                        className="w-full md:w-auto inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl font-bold text-[10px] uppercase tracking-widest text-primary hover:bg-primary/20 transition-all"
                      >
                        <UserPlus className="w-3 h-3" /> Recruit
                      </button>
                    )}
                    <Link
                      to={`/teams/${team.id}`}
                      className="w-full md:w-auto inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl font-bold text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary transition-all"
                    >
                      Audit <Shield className="w-3 h-3" />
                    </Link>
                    <Link
                      to={`/teams/${team.id}`}
                      className="w-full md:w-auto inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl font-bold text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary transition-all"
                    >
                      Access <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && mappedTeams.length === 0 && (
              <tr>
                <td colSpan={6} className="px-8 py-14 text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                  No tactical units available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {teamsTotalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
            Page {teamsPage} of {teamsTotalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={teamsPage <= 1}
              onClick={() => setTeamsPage((p) => p - 1)}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 rounded-xl disabled:opacity-30 hover:border-primary/40 transition-all"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={teamsPage >= teamsTotalPages}
              onClick={() => setTeamsPage((p) => p + 1)}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 rounded-xl disabled:opacity-30 hover:border-primary/40 transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="col-span-1 md:col-span-2 glass-panel p-8 rounded-3xl flex flex-col justify-between">
          <div>
            <h3 className="text-2xl font-bold uppercase tracking-tight mb-2">Flux Analysis</h3>
            <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest opacity-50 mb-8">
              Aggregate utilization across active nodes // Cycle-042
            </p>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <Bar dataKey="val" radius={[4, 4, 4, 4]} fill="#38bdf8" className="fill-primary opacity-50 hover:opacity-100 transition-opacity" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-primary p-8 rounded-3xl text-on-primary relative overflow-hidden shadow-xl group">
          <Zap className="text-on-primary w-10 h-10 mb-6 group-hover:scale-110 transition-transform" />
          <h3 className="text-xl font-bold uppercase tracking-tight mb-2">Protocol Insight</h3>
          <p className="text-on-primary/70 text-[11px] leading-relaxed mb-8 uppercase tracking-widest font-bold">
            A high-utilization unit is near saturation. Adjust encryption priority or allocate additional memory clusters.
          </p>
          <Link
            to="/policies"
            className="inline-block font-black text-[10px] uppercase tracking-[0.3em] border-b-2 border-on-primary pb-1 hover:brightness-110 transition-all"
          >
            Review Policy
          </Link>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Zap className="w-32 h-32" />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isNewTeamModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNewTeamModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Plus className="w-48 h-48 text-primary" />
              </div>

              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-on-surface tracking-tighter uppercase">
                    Initialize Tactical <span className="text-primary">Unit</span>
                  </h3>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] opacity-40">
                    Register new team cluster and allocate resource limits
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewTeamModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {mutationError && (
                <div className="mb-4 p-3 rounded-xl text-[10px] font-bold uppercase tracking-widest text-error bg-error/10 border border-error/20">
                  {mutationError}
                </div>
              )}

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Unit Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Neural-Ops"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Unit ID [Auto]</label>
                    <input
                      type="text"
                      placeholder="TAC-UNIT-XXXX"
                      readOnly
                      value={teamCode}
                      onChange={(e) => setTeamCode(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest font-mono opacity-50 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Monthly Credit Cap [USD]</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-mono text-primary">$</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="5,000.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-8 py-3 text-xs font-bold tracking-widest focus:border-primary/40 transition-all font-mono"
                      value={teamBudget}
                      onChange={(e) => setTeamBudget(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Allocation Priority</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['LOW', 'MEDIUM', 'HIGH'] as const).map((priority) => (
                      <button
                        key={priority}
                        type="button"
                        onClick={() => setTeamPriority(priority)}
                        className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                          teamPriority === priority
                            ? 'bg-primary/20 border-primary/40 text-primary'
                            : 'bg-white/5 border-white/10 opacity-60 hover:opacity-100'
                        }`}
                      >
                        {priority}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsNewTeamModalOpen(false)}
                    className="flex-1 py-4 glass-panel rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/5 transition-all text-on-surface-variant"
                  >
                    Abort Deployment
                  </button>
                  <button
                    type="button"
                    onClick={() => createTeam.mutate()}
                    disabled={!teamName.trim() || createTeam.isPending}
                    className="flex-1 py-4 bg-primary text-on-primary rounded-xl text-[10px] font-black uppercase tracking-[0.3em] shadow-lg status-glow active:scale-95 transition-all disabled:opacity-50"
                  >
                    {createTeam.isPending ? 'Deploying...' : 'Deploy Unit'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isAddMemberModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddMemberModalOpen(false);
                setSelectedTeamId(null);
                setMutationError(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Users className="w-48 h-48 text-primary" />
              </div>

              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-on-surface tracking-tighter uppercase">
                    Recruit Personnel to <span className="text-primary">{selectedTeamName || 'Unit'}</span>
                  </h3>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] opacity-40">
                    Assign active personnel to this tactical unit cluster
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddMemberModalOpen(false);
                    setSelectedTeamId(null);
                    setMutationError(null);
                  }}
                  className="p-2 hover:bg-white/5 rounded-lg text-on-surface-variant hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {mutationError && (
                  <div className="text-[10px] font-bold text-error uppercase tracking-widest border border-error/30 rounded-xl px-4 py-3">
                    {mutationError}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Search Personnel Registry</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary">
                      <Users className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Name, email, or user id…"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-12 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40 transition-all"
                      value={memberToSearch}
                      onChange={(e) => setMemberToSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1 opacity-60">Tier in unit</label>
                  <select
                    value={addMemberTier}
                    onChange={(e) => setAddMemberTier(e.target.value as 'MEMBER' | 'SENIOR' | 'LEAD')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest focus:border-primary/40"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="SENIOR">Senior</option>
                    <option value="LEAD">Lead</option>
                  </select>
                </div>

                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-on-surface-variant opacity-60 ml-1">Matching users (GET /users)</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {userPicker.isLoading && (
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-50 px-2">Loading…</p>
                    )}
                    {userPicker.isError && (
                      <p className="text-[10px] font-bold text-error uppercase tracking-widest px-2">Failed to load users.</p>
                    )}
                    {!userPicker.isLoading && !userPicker.isError && pickerUsers.length === 0 && (
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-50 px-2">No users found.</p>
                    )}
                    {pickerUsers.map((u) => {
                      const initials = u.fullName
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();
                      const selected = selectedUserId === u.id;
                      return (
                        <button
                          type="button"
                          key={u.id}
                          onClick={() => setSelectedUserId(u.id)}
                          className={`w-full flex items-center justify-between p-3 glass-panel rounded-xl border transition-all text-left ${
                            selected ? 'border-primary/60 bg-primary/10' : 'border-white/10 hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[10px] font-black text-primary flex-shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-on-surface uppercase tracking-wider truncate">{u.fullName}</p>
                              <p className="text-[8px] text-primary font-mono mt-1 opacity-60 truncate">{u.email}</p>
                              <p className="text-[8px] text-on-surface-variant uppercase tracking-widest opacity-50">
                                {u.role} · {u.status}
                              </p>
                            </div>
                          </div>
                          {selected && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMemberModalOpen(false);
                      setSelectedTeamId(null);
                      setMutationError(null);
                    }}
                    className="flex-1 py-4 glass-panel rounded-xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-white/5 transition-all text-on-surface-variant"
                  >
                    Abort Assignment
                  </button>
                  <button
                    type="button"
                    onClick={() => addTeamMember.mutate()}
                    disabled={!selectedUserId || !selectedTeamId || addTeamMember.isPending}
                    className="flex-1 py-4 bg-primary text-on-primary rounded-xl text-[10px] font-black uppercase tracking-[0.3em] shadow-lg status-glow active:scale-95 transition-all disabled:opacity-40"
                  >
                    {addTeamMember.isPending ? 'Adding…' : 'Add to unit'}
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

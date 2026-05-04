/* eslint-disable react/react-in-jsx-scope */
import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Code,
  Database,
  Download,
  Mail,
  Search,
  ShieldCheck,
  Terminal,
  User,
} from 'lucide-react';
import { SegmentedFilterButton } from '@/components/atoms/SegmentedFilterButton';
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { getPaginatedEnvelope } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { canUseCapability } from '@/lib/capabilities';

type AuditTargetType = 'SYSTEM' | 'POLICY' | 'API_KEY' | 'USER' | 'TEAM';

interface AuditLogItem {
  id: string;
  timestamp: string;
  actor: {
    name: string;
    email: string;
  };
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  details: Record<string, unknown>;
}

export default function AuditLogs() {
  const { isAdmin, isTeamLead } = useAuth();
  const role = { isAdmin, isTeamLead };
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | AuditTargetType>('ALL');
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const limit = 20;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-logs', searchTerm, typeFilter, page, limit, fromDate, toDate],
    queryFn: async () => {
      const result = await getPaginatedEnvelope<AuditLogItem[]>('/audit-logs', {
        page,
        limit,
        ...(searchTerm.trim() ? { q: searchTerm.trim() } : {}),
        ...(typeFilter !== 'ALL' ? { targetType: typeFilter } : {}),
        ...(fromDate.trim() ? { from: fromDate.trim() } : {}),
        ...(toDate.trim() ? { to: toDate.trim() } : {}),
      });
      return result;
    },
  });

  const filteredLogs = useMemo(() => {
    return data?.data ?? [];
  }, [data]);
  const totalPages = data?.pagination?.pages ?? 1;
  const pageButtons = useMemo(() => {
    const length = Math.min(totalPages, 3);
    const start = Math.max(1, Math.min(page - 1, totalPages - length + 1));
    return Array.from({ length }, (_, index) => start + index);
  }, [page, totalPages]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-5xl font-black text-on-surface tracking-tighter uppercase">
            Audit <span className="text-primary opacity-80">Chronicle</span>
          </motion.h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Immutable operation manifest. Every delta, extraction, and system shift is recorded in the Sovereign Ledger for regulatory alignment.
          </p>
        </div>
        {canUseCapability(role, 'audit.export') ? (
          <button type="button" className="flex items-center justify-center gap-3 px-8 py-4 bg-white/5 text-on-surface font-black text-[11px] uppercase tracking-[0.2em] rounded-xl border border-white/5 transition-all">
            <Download className="w-4 h-4" /> Export Operations Manifest
          </button>
        ) : (
          <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant opacity-70">
            Export not available yet
          </div>
        )}
      </div>

      {isError && (
        <ErrorPanel message="Failed to load audit logs (check envelope or query params)." onRetry={() => void refetch()} />
      )}

      <div className="glass-panel rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-4 space-y-1">
          <label htmlFor="audit-from" className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60 ml-1">
            From (ISO date)
          </label>
          <input
            id="audit-from"
            type="date"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="md:col-span-4 space-y-1">
          <label htmlFor="audit-to" className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60 ml-1">
            To (ISO date)
          </label>
          <input
            id="audit-to"
            type="date"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="md:col-span-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
              setPage(1);
            }}
            className="flex-1 py-2 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/10 text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all"
          >
            Clear date range
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 glass-panel p-4 rounded-xl flex items-center gap-3">
          <Search className="text-primary w-4 h-4 ml-2" />
          <label htmlFor="auditlogs-search" className="sr-only">Search audit logs</label>
          <input
            id="auditlogs-search"
            type="text"
            placeholder="Query logs by actor designation or target id..."
            className="bg-transparent border-none focus:ring-0 w-full text-xs font-bold uppercase tracking-widest placeholder:text-on-surface-variant/40"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="md:col-span-4 glass-panel p-2 rounded-xl flex" role="group" aria-label="Audit target filter">
          {(['ALL', 'SYSTEM', 'POLICY', 'API_KEY', 'USER', 'TEAM'] as const).map((item) => (
            <SegmentedFilterButton
              key={item}
              label={item === 'API_KEY' ? 'KEYS' : item}
              isActive={typeFilter === item}
              onClick={() => {
                setTypeFilter(item);
                setPage(1);
              }}
              className="text-[8px]"
            />
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-x-auto border border-white/5">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="bg-white/5">
              <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Timeline Execution</th>
              <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Authorized Actor</th>
              <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Operational Action</th>
              <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50">Target Classification</th>
              <th scope="col" className="px-6 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-50 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-xs font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                  Loading audit entries...
                </td>
              </tr>
            )}
            {!isLoading && filteredLogs.map((log) => (
              <Fragment key={log.id}>
                <tr
                  onClick={() => setExpandedRow((prev) => (prev === log.id ? null : log.id))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setExpandedRow((prev) => (prev === log.id ? null : log.id));
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${log.action} by ${log.actor.name} on ${log.timestamp}`}
                  aria-expanded={expandedRow === log.id}
                  className={`group transition-all cursor-pointer ${expandedRow === log.id ? 'bg-primary/5' : 'hover:bg-white/5'}`}
                >
                  <td className="px-6 py-8">
                    <div className="flex items-center gap-3">
                      <Clock className="w-3 h-3 text-primary opacity-40" />
                      <span className="text-[11px] font-mono font-bold text-on-surface-variant">{log.timestamp}</span>
                    </div>
                  </td>
                  <td className="px-6 py-8">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-on-surface uppercase tracking-tight">{log.actor.name}</span>
                      <span className="text-[9px] text-on-surface-variant opacity-60 flex items-center gap-1 mt-0.5">
                        <Mail className="w-2.5 h-2.5" /> {log.actor.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-8">
                    <span className="text-[10px] font-black text-on-surface-variant bg-white/5 border border-white/5 px-3 py-1 rounded-md uppercase tracking-widest group-hover:border-primary/20 group-hover:text-primary transition-all">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-8">
                    <div className="flex flex-col">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded w-fit ${log.targetType === 'SYSTEM' ? 'bg-tertiary/10 text-tertiary' : log.targetType === 'API_KEY' ? 'bg-primary/10 text-primary' : 'bg-white/10 text-on-surface-variant'}`}>
                        {log.targetType}
                      </span>
                      <span className="text-[10px] font-mono mt-1 opacity-60 uppercase tracking-tighter truncate max-w-[150px]">
                        {log.targetId}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-8 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <div className="p-1 glass-panel rounded-md text-on-surface-variant">
                        {expandedRow === log.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </td>
                </tr>

                <tr className="bg-surface-container-lowest">
                  <td colSpan={5} className="p-0">
                    <AnimatePresence>
                      {expandedRow === log.id && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden px-12 py-10">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                          <div className="md:col-span-8 flex flex-col gap-6">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                              <Terminal className="w-4 h-4" /> Metadata Extraction
                            </div>
                            <div className="glass-panel p-6 rounded-2xl border-white/5 bg-surface font-mono text-[11px] leading-relaxed relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                <Code className="w-24 h-24" />
                              </div>
                              <pre className="text-primary/90 whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                            </div>
                          </div>

                          <div className="md:col-span-4 space-y-6">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                              <Activity className="w-4 h-4" /> Relational Links
                            </div>
                            <div className="space-y-3">
                              <button type="button" className="w-full flex items-center justify-between p-4 glass-panel rounded-xl group hover:border-primary/40 transition-all">
                                <div className="flex items-center gap-3">
                                  <User className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-all" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Inspect Actor Profile</span>
                                </div>
                                <ChevronRight className="w-4 h-4 opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                              </button>
                              <button type="button" className="w-full flex items-center justify-between p-4 glass-panel rounded-xl group hover:border-primary/40 transition-all">
                                <div className="flex items-center gap-3">
                                  <Database className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-all" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">View Target Object</span>
                                </div>
                                <ChevronRight className="w-4 h-4 opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                              </button>
                              <button type="button" className="w-full flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl group hover:border-primary/40 transition-all opacity-40">
                                <div className="flex items-center gap-3">
                                  <ShieldCheck className="w-4 h-4" />
                                  <span className="text-[10px] font-black uppercase tracking-widest">Verify Ledger Signature</span>
                                </div>
                                <ChevronRight className="w-4 h-4 opacity-20 group-hover:opacity-100" />
                              </button>
                            </div>
                          </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </td>
                </tr>
              </Fragment>
            ))}
            {!isLoading && filteredLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10">
                  <EmptyState message="No audit entries match current query." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-4 pt-4">
        <button
          type="button"
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page <= 1}
          className={`w-10 h-10 flex items-center justify-center rounded-xl glass-panel ${page <= 1 ? 'opacity-20 cursor-not-allowed' : ''}`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex gap-2">
          {pageButtons.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => setPage(p)}
              className={`w-10 h-10 flex items-center justify-center rounded-xl font-mono text-[11px] font-bold transition-all ${p === page ? 'bg-primary text-on-primary shadow-lg' : 'glass-panel text-on-surface-variant'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={page >= totalPages}
          className={`w-10 h-10 flex items-center justify-center rounded-xl glass-panel hover:text-primary transition-all ${page >= totalPages ? 'opacity-20 cursor-not-allowed' : ''}`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

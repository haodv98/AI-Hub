/* eslint-disable react/react-in-jsx-scope */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { AlertCircle, Terminal, ArrowRight, UserPlus, Wallet } from 'lucide-react';
import { KPICard } from '@/components/molecules/KPICard';
import { ProgressBar } from '@/components/atoms/ProgressBar';
import { formatUsd, formatNumber } from '@/lib/utils';
import { getEnvelope } from '@/lib/api';

interface DailySummaryRow {
  date: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

interface TeamSummaryRow {
  teamId: string;
  teamName: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

interface OrgSummary {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  teamCount: number;
  byDay: DailySummaryRow[];
  byTeam: TeamSummaryRow[];
}

function useDashboardSummary() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const to = now.toISOString().split('T')[0];
  return useQuery<OrgSummary>({
    queryKey: ['usage', 'summary', from, to],
    queryFn: () => getEnvelope<OrgSummary>('/usage/summary', { from, to }),
    refetchInterval: 60_000,
  });
}

export default function Dashboard() {
  const { data: summary, isLoading } = useDashboardSummary();

  const logs = [
    { time: '[14:22:01]', status: 'STABLE', msg: 'Core verified via Sector-7 oversight', statusColor: 'text-primary' },
    { time: '[14:21:58]', status: 'STABLE', msg: "Telemetric stream calibrated to Node-Gamma", statusColor: 'text-primary' },
    { time: '[14:21:45]', status: 'SEC-LOCK', msg: 'Unusual query density detected in Segment-B', statusColor: 'text-error' },
    { time: '[14:21:32]', status: 'STABLE', msg: 'Encryption layer active // RSA-4096 validated', statusColor: 'text-primary' },
  ];

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center h-[60vh]">
        <div className="orb scale-150" aria-hidden="true"></div>
        <span className="sr-only">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <motion.h2 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-4xl font-extrabold text-on-surface tracking-tighter uppercase"
        >
          Telemetry <span className="text-primary opacity-80">Overview</span>
        </motion.h2>
        <p className="text-on-surface-variant font-medium mt-2 text-lg tracking-widest uppercase text-xs opacity-50">Operational Oversight // Fleet Protocol</p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <KPICard 
          title="MTD Spend" 
          value={formatUsd(summary?.totalCost ?? 0)} 
          unit="CREDITS" 
          trend="+5%" 
          type="up" 
        />
        <KPICard 
          title="Active Teams" 
          value={formatNumber(summary?.teamCount ?? 0)} 
          unit="Sectors" 
          trend="+2%" 
          type="up" 
        />
        <KPICard 
          title="Request Flux" 
          value={formatNumber(summary?.totalRequests ?? 0)} 
          unit="Events" 
          trend="-1%" 
          type="down" 
        />
        <KPICard 
          title="Anomaly Rate" 
          value="0.04%" 
          unit="Delta" 
          trend="stable" 
          type="stable" 
        />
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 xl:col-span-8 glass-panel p-8 rounded-3xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03)_0%,transparent_70%)] pointer-events-none"></div>
          <div className="flex justify-between items-end mb-10 relative z-10">
            <div>
              <h3 className="text-2xl font-bold uppercase tracking-tight">Resource Flux</h3>
              <p className="text-[10px] text-on-surface-variant mt-1 font-bold uppercase tracking-[0.2em] opacity-40">Fiscal distribution across internal divisions</p>
            </div>
            <button
              type="button"
              disabled
              className="text-[10px] font-bold text-primary/60 flex items-center uppercase tracking-widest cursor-not-allowed"
            >
              Detailed Ledger <ArrowRight className="ml-1 w-3 h-3" />
            </button>
          </div>
          
          <div className="space-y-10 relative z-10">
            {summary?.byTeam?.slice(0, 3).map((team, idx) => (
              <ProgressBar 
                key={team.teamId} 
                label={team.teamName} 
                current={formatUsd(team.costUsd)} 
                total={formatUsd(Math.max(team.costUsd * 1.5, 1000))}
                color={idx === 2 ? 'bg-error' : 'bg-primary'}
              />
            )) || (
              <>
                <ProgressBar label="Core Strategy" current="$8,400" total="$10k" />
                <ProgressBar label="Bio-Tech" current="$3,100" total="$15k" />
                <ProgressBar label="Growth Ops" current="$4,950" total="$5k" color="bg-error" />
              </>
            )}
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 pt-10 border-t border-white/5 relative z-10">
            <div className="text-center">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.3em] opacity-50">Efficiency</p>
              <p className="text-[8px] text-on-surface-variant opacity-40 uppercase tracking-widest">Estimated</p>
              <p className="text-2xl font-mono font-bold text-on-surface mt-2">94.2%</p>
            </div>
            <div className="text-center border-x border-white/5 px-4">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.3em] opacity-50">Flux Risk</p>
              <p className="text-[8px] text-on-surface-variant opacity-40 uppercase tracking-widest">Estimated</p>
              <p className="text-2xl font-mono font-bold text-error mt-2">High</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.3em] opacity-50">Forecast</p>
              <p className="text-2xl font-mono font-bold text-on-surface mt-2">{formatUsd((summary?.totalCost ?? 0) * 1.2)}</p>
            </div>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-4 space-y-8">
          <div className="glass-panel p-6 rounded-2xl">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-6 opacity-40">Node Stability</h4>
            <div className="space-y-4">
              {[
                { name: 'Node-Alpha', val: '99.9%', color: 'text-primary' },
                { name: 'Node-Gamma', val: '98.5%', color: 'text-secondary' },
                { name: 'Core-Prime', val: '100.0%', color: 'text-primary' }
              ].map(provider => (
                <div key={provider.name} className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-all cursor-crosshair">
                  <span className="text-xs font-bold uppercase tracking-widest opacity-80">{provider.name}</span>
                  <div className="flex items-center">
                    <span className={`text-[11px] font-mono font-bold ${provider.color} mr-3`}>{provider.val}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-primary status-glow animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl border-error/20">
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-error mb-6 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" /> Sector Anomalies
            </h4>
            <ul className="space-y-6">
              <li
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
                }}
                className="flex items-start group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-error/10 border border-error/20 flex items-center justify-center text-error mr-4 group-hover:bg-error/20 transition-all">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface uppercase tracking-tight">5 Identities unlinked</p>
                  <p className="text-[10px] font-medium text-on-surface-variant opacity-60">Sync required for Sector-7</p>
                </div>
              </li>
              <li
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
                }}
                className="flex items-start group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-error/10 border border-error/20 flex items-center justify-center text-error mr-4 group-hover:bg-error/20 transition-all">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface uppercase tracking-tight">Flux Limit Detected</p>
                  <p className="text-[10px] font-medium text-on-surface-variant opacity-60">98% of Sector-Alpha cap</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <section className="glass-panel rounded-3xl overflow-hidden">
        <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Terminal className="text-primary w-4 h-4" />
            <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-widest">System_Event_Log</span>
          </div>
          <div className="flex space-x-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
          </div>
        </div>
        <div className="p-6 font-mono text-[11px] space-y-3">
          {logs.map((log, i) => (
            <div key={i} className="flex">
              <span className="w-24 flex-shrink-0 text-on-surface-variant opacity-40">{log.time}</span>
              <span className={`${log.statusColor} mr-6 font-bold tracking-widest`}>{log.status}</span>
              <span className="text-on-surface opacity-80 underline underline-offset-4 decoration-white/5">{log.msg}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

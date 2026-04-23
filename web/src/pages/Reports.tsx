/* eslint-disable react/react-in-jsx-scope */
import { useQuery } from '@tanstack/react-query';
import { FileText, RefreshCw } from 'lucide-react';
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { getEnvelope } from '@/lib/api';
import { formatUsd } from '@/lib/utils';

interface MonthlyReport {
  month: string;
  generatedAt: string;
  totalSpendUsd: number;
  status: 'ready';
}

interface Preview {
  month: string;
  totalSpendUsd: number;
  totalRequests: number;
  averageLatencyMs: number;
}

export default function Reports() {
  const reportsQuery = useQuery<MonthlyReport[]>({
    queryKey: ['reports', 'list'],
    queryFn: () => getEnvelope('/reports?limit=12'),
  });

  const previewQuery = useQuery<Preview>({
    queryKey: ['reports', 'preview-current-month'],
    queryFn: () => getEnvelope('/reports/preview/current-month'),
  });

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-black text-on-surface tracking-tighter uppercase">
            Reports <span className="text-primary opacity-80">Center</span>
          </h1>
          <p className="text-sm text-on-surface-variant font-bold mt-4 tracking-widest uppercase opacity-60">
            Monthly spend snapshots and current month live preview.
          </p>
        </div>
      </div>

      {(reportsQuery.isError || previewQuery.isError) && (
        <ErrorPanel
          message="Failed to load reports."
          onRetry={() => {
            reportsQuery.refetch();
            previewQuery.refetch();
          }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Current Month</p>
          <p className="text-2xl font-black mt-2">{previewQuery.data?.month ?? '--'}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Spend MTD</p>
          <p className="text-2xl font-black mt-2">{formatUsd(previewQuery.data?.totalSpendUsd ?? 0)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Requests MTD</p>
          <p className="text-2xl font-black mt-2">{previewQuery.data?.totalRequests ?? 0}</p>
        </div>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Monthly Reports
          </h3>
          {(reportsQuery.isLoading || previewQuery.isLoading) && (
            <span className="text-xs text-on-surface-variant flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Syncing...
            </span>
          )}
        </div>

        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="bg-white/5">
              <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Month</th>
              <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Generated At</th>
              <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Total Spend</th>
              <th className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(reportsQuery.data ?? []).map((report) => (
              <tr key={report.month} className="hover:bg-white/5">
                <td className="px-8 py-5 text-xs font-black uppercase tracking-widest">{report.month}</td>
                <td className="px-8 py-5 text-xs text-on-surface-variant">
                  {new Date(report.generatedAt).toLocaleString()}
                </td>
                <td className="px-8 py-5 text-xs font-mono">{formatUsd(report.totalSpendUsd)}</td>
                <td className="px-8 py-5">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded bg-primary/10 text-primary">
                    {report.status}
                  </span>
                </td>
              </tr>
            ))}
            {!reportsQuery.isLoading && (reportsQuery.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-8 py-8">
                  <EmptyState message="No report snapshots available yet." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

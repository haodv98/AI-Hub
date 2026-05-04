/* eslint-disable react/react-in-jsx-scope */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorPanel } from '@/components/ui/RequestState';
import { getEnvelope } from '@/lib/api';

interface UsageHeatmapProps {
  from: string;
  to: string;
}

interface HeatmapRow {
  dayOfWeek: number;
  hourOfDay: number;
  requestCount: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function UsageHeatmap({ from, to }: UsageHeatmapProps) {
  const query = useQuery<HeatmapRow[]>({
    queryKey: ['usage', 'heatmap', from, to],
    queryFn: () => getEnvelope<HeatmapRow[]>('/usage/heatmap', { from, to }),
  });

  const maxCount = useMemo(
    () => Math.max(...(query.data ?? []).map((row) => row.requestCount), 1),
    [query.data],
  );

  const matrix = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data ?? []) {
      map.set(`${row.dayOfWeek}-${row.hourOfDay}`, row.requestCount);
    }
    return map;
  }, [query.data]);

  const heatmapEmpty = !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0;

  return (
    <div className="glass-panel rounded-3xl p-6">
      <h3 className="text-xl font-black uppercase tracking-tight mb-4">Usage Heatmap</h3>
      {query.isError && (
        <ErrorPanel message="Failed to load usage heatmap." onRetry={() => void query.refetch()} />
      )}
      {!query.isError && (
        <div className="overflow-x-auto">
          <div className="min-w-[960px] grid grid-cols-[80px_repeat(24,minmax(24px,1fr))] gap-1">
            <div />
            {Array.from({ length: 24 }).map((_, hour) => (
              <div key={`hour-${hour}`} className="text-[9px] text-center font-bold text-on-surface-variant">
                {hour}
              </div>
            ))}
            {DAY_LABELS.map((day, dow) => (
              <div key={day} className="contents">
                <div className="text-[10px] font-bold text-on-surface-variant flex items-center">{day}</div>
                {Array.from({ length: 24 }).map((_, hour) => {
                  const count = matrix.get(`${dow}-${hour}`) ?? 0;
                  const alpha = Math.max(0.08, count / maxCount);
                  return (
                    <div
                      key={`${day}-${hour}`}
                      title={`${day} ${hour}:00 - ${count} requests`}
                      className="h-6 rounded"
                      style={{ backgroundColor: `rgba(56, 189, 248, ${alpha})` }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {query.isLoading && <p className="text-xs text-on-surface-variant mt-3">Loading heatmap...</p>}
      {heatmapEmpty && (
        <div className="mt-4">
          <EmptyState message="No requests in this window to plot by hour and weekday." />
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUsd, formatNumber } from '@/lib/utils';
import api from '@/lib/api';

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export default function Usage() {
  const [range] = useState(defaultRange);

  const { data, isLoading } = useQuery({
    queryKey: ['usage', 'summary', range],
    queryFn: () =>
      api.get(`/usage/summary?from=${range.from}&to=${range.to}`).then((r) => r.data.data),
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Usage</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {['Total spend', 'Total tokens', 'Total requests'].map((label, i) => (
          <div key={label} className="rounded-xl border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold">
              {isLoading
                ? '…'
                : i === 0
                  ? formatUsd(data?.totalCost ?? 0)
                  : i === 1
                    ? formatNumber(data?.totalTokens ?? 0)
                    : formatNumber(data?.totalRequests ?? 0)}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold mb-4">Daily breakdown</h2>
        <p className="text-sm text-muted-foreground">
          Select a team or user to see detailed usage breakdowns.
        </p>
      </div>
    </div>
  );
}

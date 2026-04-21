import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import api from '@/lib/api';

interface Policy {
  id: string;
  name: string;
  teamId: string | null;
  userId: string | null;
  tier: string | null;
  priority: number;
  isActive: boolean;
  allowedEngines: string[];
}

function scopeLabel(policy: Policy): string {
  if (policy.userId) return 'Individual';
  if (policy.teamId && policy.tier) return 'Role';
  if (policy.teamId) return 'Team';
  return 'Org';
}

function usePolicies() {
  return useQuery<Policy[]>({
    queryKey: ['policies'],
    queryFn: () => api.get('/policies').then((r) => r.data.data),
  });
}

export default function Policies() {
  const { data: policies, isLoading } = usePolicies();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
        <Link
          to="/policies/new"
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          New policy
        </Link>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Scope</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Priority</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Engines</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies?.map((policy) => (
                <tr key={policy.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{policy.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                      {scopeLabel(policy)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{policy.priority}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {policy.allowedEngines.length === 0
                      ? 'All'
                      : policy.allowedEngines.slice(0, 2).join(', ') +
                        (policy.allowedEngines.length > 2
                          ? ` +${policy.allowedEngines.length - 2}`
                          : '')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={policy.isActive ? 'ACTIVE' : 'REVOKED'} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/policies/${policy.id}/edit`}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {policies?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No policies yet. Create one to control access.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { CostBar } from '@/components/ui/CostBar';
import { TableSkeleton } from '@/components/ui/LoadingSkeleton';
import { formatUsd } from '@/lib/utils';
import api from '@/lib/api';

interface Team {
  id: string;
  name: string;
  description: string | null;
  monthlyBudgetUsd: number;
  _count?: { members: number };
}

const createTeamSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  monthlyBudgetUsd: z.coerce.number().positive('Budget must be positive'),
});

type CreateTeamForm = z.infer<typeof createTeamSchema>;

function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data.data),
  });
}

function CreateTeamModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreateTeamForm>({ resolver: zodResolver(createTeamSchema) });

  const create = useMutation({
    mutationFn: (data: CreateTeamForm) => api.post('/teams', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      onClose();
    },
    onError: (err: any) => {
      setError('root', { message: err.response?.data?.error ?? 'Failed to create team' });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-5">Create team</h2>
        <form onSubmit={handleSubmit((d) => create.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input
              {...register('name')}
              placeholder="e.g. Backend Engineering"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <input
              {...register('description')}
              placeholder="Optional description"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Monthly budget (USD)</label>
            <input
              {...register('monthlyBudgetUsd')}
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 500"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {errors.monthlyBudgetUsd && (
              <p className="mt-1 text-xs text-rose-600">{errors.monthlyBudgetUsd.message}</p>
            )}
          </div>

          {errors.root && (
            <p className="text-xs text-rose-600 bg-rose-50 rounded px-3 py-2">{errors.root.message}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Creating…' : 'Create team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Teams() {
  const { data: teams, isLoading } = useTeams();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          New team
        </button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Team</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Members</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-48">Budget</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {teams?.map((team) => (
                <tr key={team.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{team.name}</p>
                    {team.description && (
                      <p className="text-xs text-muted-foreground">{team.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{team._count?.members ?? '—'}</td>
                  <td className="px-4 py-3">
                    <CostBar used={0} cap={team.monthlyBudgetUsd} />
                    <p className="text-xs text-muted-foreground mt-1">
                      cap: {formatUsd(team.monthlyBudgetUsd)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/teams/${team.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {teams?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No teams yet. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateTeamModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

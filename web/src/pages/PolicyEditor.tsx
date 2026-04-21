import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { formatUsd } from '@/lib/utils';
import api from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
}

interface PolicyDetail {
  id: string;
  name: string;
  isActive: boolean;
  priority: number;
  teamId: string | null;
  userId: string | null;
  tier: string | null;
  allowedEngines: string[];
  config: {
    limits?: { rpm?: number; dailyTokens?: number; monthlyBudgetUsd?: number };
    fallback?: { thresholdPct?: number; fromModel?: string; toModel?: string };
  };
}

// ── Schema ────────────────────────────────────────────────────────────────────

const SCOPE_TYPES = ['org', 'team', 'role', 'individual'] as const;
const TIERS = ['STANDARD', 'PREMIUM', 'BASIC'] as const;
const ENGINES = {
  Claude: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  OpenAI: ['gpt-4o', 'gpt-4o-mini'],
  Gemini: ['gemini-2.0-flash'],
} as const;

const ALL_ENGINES = Object.values(ENGINES).flat();

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  isActive: z.boolean(),
  priority: z.coerce.number().int().min(1).max(100),
  scopeType: z.enum(SCOPE_TYPES),
  teamId: z.string().optional(),
  userId: z.string().optional(),
  tier: z.enum(TIERS).optional(),
  allowedEngines: z.array(z.string()),
  rpmLimit: z.coerce.number().int().positive().optional().or(z.literal('')),
  dailyTokens: z.coerce.number().int().positive().optional().or(z.literal('')),
  monthlyBudgetUsd: z.coerce.number().positive().optional().or(z.literal('')),
  fallbackEnabled: z.boolean(),
  fallbackThresholdPct: z.coerce.number().min(1).max(100).optional().or(z.literal('')),
  fallbackFromModel: z.string().optional(),
  fallbackToModel: z.string().optional(),
});

type PolicyForm = z.infer<typeof schema>;

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-rose-600">{message}</p>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 pb-2 border-b border-border">
      {children}
    </h3>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => api.get('/teams').then((r) => r.data.data ?? []),
  });
}

function usePolicyDetail(id: string | undefined) {
  return useQuery<PolicyDetail>({
    queryKey: ['policies', id],
    queryFn: () => api.get(`/policies/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });
}

export default function PolicyEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!id;

  const { data: teams } = useTeams();
  const { data: existing, isLoading: loadingPolicy } = usePolicyDetail(id);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<PolicyForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      isActive: true,
      priority: 50,
      scopeType: 'org',
      allowedEngines: [],
      fallbackEnabled: false,
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (!existing) return;
    let scopeType: (typeof SCOPE_TYPES)[number] = 'org';
    if (existing.userId) scopeType = 'individual';
    else if (existing.teamId && existing.tier) scopeType = 'role';
    else if (existing.teamId) scopeType = 'team';

    reset({
      name: existing.name,
      isActive: existing.isActive,
      priority: existing.priority,
      scopeType,
      teamId: existing.teamId ?? undefined,
      userId: existing.userId ?? undefined,
      tier: (existing.tier as (typeof TIERS)[number]) ?? undefined,
      allowedEngines: existing.allowedEngines,
      rpmLimit: existing.config.limits?.rpm ?? '',
      dailyTokens: existing.config.limits?.dailyTokens ?? '',
      monthlyBudgetUsd: existing.config.limits?.monthlyBudgetUsd ?? '',
      fallbackEnabled: !!existing.config.fallback,
      fallbackThresholdPct: existing.config.fallback?.thresholdPct ?? '',
      fallbackFromModel: existing.config.fallback?.fromModel ?? '',
      fallbackToModel: existing.config.fallback?.toModel ?? '',
    });
  }, [existing, reset]);

  const scopeType = watch('scopeType');
  const fallbackEnabled = watch('fallbackEnabled');
  const watchedEngines = watch('allowedEngines');
  const watchedBudget = watch('monthlyBudgetUsd');
  const watchedRpm = watch('rpmLimit');

  const save = useMutation({
    mutationFn: (data: PolicyForm) => {
      const payload = {
        name: data.name,
        isActive: data.isActive,
        priority: data.priority,
        teamId: data.scopeType === 'team' || data.scopeType === 'role' ? data.teamId : null,
        userId: data.scopeType === 'individual' ? data.userId : null,
        tier: data.scopeType === 'role' ? data.tier : null,
        allowedEngines: data.allowedEngines,
        config: {
          limits: {
            ...(data.rpmLimit ? { rpm: Number(data.rpmLimit) } : {}),
            ...(data.dailyTokens ? { dailyTokens: Number(data.dailyTokens) } : {}),
            ...(data.monthlyBudgetUsd ? { monthlyBudgetUsd: Number(data.monthlyBudgetUsd) } : {}),
          },
          ...(data.fallbackEnabled && data.fallbackThresholdPct
            ? {
                fallback: {
                  thresholdPct: Number(data.fallbackThresholdPct),
                  fromModel: data.fallbackFromModel,
                  toModel: data.fallbackToModel,
                },
              }
            : {}),
        },
      };
      return isEdit
        ? api.put(`/policies/${id}`, payload)
        : api.post('/policies', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies'] });
      navigate('/policies');
    },
    onError: (err: any) => {
      setError('root', { message: err.response?.data?.error ?? 'Failed to save policy' });
    },
  });

  function toggleEngine(engine: string) {
    const current = watchedEngines;
    setValue(
      'allowedEngines',
      current.includes(engine) ? current.filter((e) => e !== engine) : [...current, engine],
    );
  }

  function scopeDescription(): string {
    switch (scopeType) {
      case 'org': return 'All users in the organization';
      case 'team': return 'All members of the selected team';
      case 'role': return 'Members with selected tier in the selected team';
      case 'individual': return 'A specific user';
    }
  }

  if (isEdit && loadingPolicy) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link to="/policies" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1">
          ← Policies
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? 'Edit policy' : 'Create policy'}
        </h1>
      </div>

      <form onSubmit={handleSubmit((d) => save.mutate(d))}>
        <div className="grid grid-cols-5 gap-6">
          {/* Left: form */}
          <div className="col-span-3 space-y-6">

            {/* Section 1: Basic */}
            <div className="rounded-xl border border-border p-5">
              <SectionHeader>Policy name &amp; status</SectionHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Name</label>
                  <input
                    {...register('name')}
                    placeholder="e.g. Backend team — standard"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <FieldError message={errors.name?.message} />
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1.5">Priority (1–100)</label>
                    <input
                      {...register('priority')}
                      type="number"
                      min={1}
                      max={100}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <FieldError message={errors.priority?.message} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">Active</label>
                    <label className="flex items-center gap-2 cursor-pointer mt-2">
                      <input {...register('isActive')} type="checkbox" className="accent-primary w-4 h-4" />
                      <span className="text-sm">Enabled</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Scope */}
            <div className="rounded-xl border border-border p-5">
              <SectionHeader>Scope</SectionHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {SCOPE_TYPES.map((s) => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value={s}
                        {...register('scopeType')}
                        className="accent-primary"
                      />
                      <span className="text-sm capitalize">{s}</span>
                    </label>
                  ))}
                </div>

                {(scopeType === 'team' || scopeType === 'role') && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Team</label>
                    <select
                      {...register('teamId')}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Select team…</option>
                      {teams?.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {scopeType === 'role' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Tier</label>
                    <select
                      {...register('tier')}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Select tier…</option>
                      {TIERS.map((t) => (
                        <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                  </div>
                )}

                {scopeType === 'individual' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">User ID</label>
                    <input
                      {...register('userId')}
                      placeholder="User UUID"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Engines */}
            <div className="rounded-xl border border-border p-5">
              <SectionHeader>Allowed engines</SectionHeader>
              <p className="text-xs text-muted-foreground mb-4">
                No selection = allow all engines. Select specific engines to restrict access.
              </p>
              <div className="space-y-4">
                {Object.entries(ENGINES).map(([provider, models]) => (
                  <div key={provider}>
                    <p className="text-xs font-medium text-muted-foreground mb-2">{provider}</p>
                    <div className="space-y-2 pl-2">
                      {models.map((model) => (
                        <label key={model} className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={watchedEngines.includes(model)}
                            onChange={() => toggleEngine(model)}
                            className="accent-primary w-4 h-4"
                          />
                          <span className="text-sm font-mono text-xs">{model}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 4: Limits */}
            <div className="rounded-xl border border-border p-5">
              <SectionHeader>Limits</SectionHeader>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">RPM</label>
                  <input
                    {...register('rpmLimit')}
                    type="number"
                    min={1}
                    placeholder="No limit"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Daily tokens</label>
                  <input
                    {...register('dailyTokens')}
                    type="number"
                    min={1}
                    placeholder="No limit"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Monthly budget (USD)</label>
                  <input
                    {...register('monthlyBudgetUsd')}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="No limit"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </div>

            {/* Section 5: Fallback */}
            <div className="rounded-xl border border-border p-5">
              <SectionHeader>Model fallback</SectionHeader>
              <label className="flex items-center gap-2 cursor-pointer mb-4">
                <input {...register('fallbackEnabled')} type="checkbox" className="accent-primary w-4 h-4" />
                <span className="text-sm">Enable automatic model fallback</span>
              </label>

              {fallbackEnabled && (
                <div className="space-y-4 pl-1">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Trigger at budget %</label>
                    <input
                      {...register('fallbackThresholdPct')}
                      type="number"
                      min={1}
                      max={100}
                      placeholder="e.g. 80"
                      className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">From model</label>
                      <select
                        {...register('fallbackFromModel')}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">Select…</option>
                        {ALL_ENGINES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">To model (cheaper)</label>
                      <select
                        {...register('fallbackToModel')}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="">Select…</option>
                        {ALL_ENGINES.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {errors.root && (
              <p className="text-xs text-rose-600 bg-rose-50 rounded px-3 py-2">{errors.root.message}</p>
            )}

            <div className="flex justify-end gap-3">
              <Link
                to="/policies"
                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted/50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : isEdit ? 'Update policy' : 'Create policy'}
              </button>
            </div>
          </div>

          {/* Right: preview */}
          <div className="col-span-2">
            <div className="sticky top-8 rounded-xl border border-border p-5 space-y-5">
              <h3 className="text-sm font-semibold">Policy preview</h3>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Scope</p>
                  <p>{scopeDescription()}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Engines</p>
                  {watchedEngines.length === 0 ? (
                    <p className="text-muted-foreground">All engines allowed</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {watchedEngines.map((e) => (
                        <span key={e} className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted font-mono">
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Limits</p>
                  {!watchedBudget && !watchedRpm ? (
                    <p className="text-muted-foreground">No limits set</p>
                  ) : (
                    <div className="space-y-1">
                      {watchedBudget && <p>Budget: {formatUsd(Number(watchedBudget))} / month</p>}
                      {watchedRpm && <p>Rate: {watchedRpm} RPM</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

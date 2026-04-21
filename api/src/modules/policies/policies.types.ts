export interface PolicyLimits {
  rpm: number;
  dailyTokens: number;
  monthlyBudgetUsd: number;
}

export interface PolicyFallback {
  thresholdPct: number;
  fromModel: string | null;
  toModel: string | null;
}

export interface PolicyConfig {
  limits: PolicyLimits;
  fallback?: PolicyFallback;
}

export type PolicyResolvedFrom =
  | 'individual'
  | 'role'
  | 'team'
  | 'org-default'
  | 'system-default';

export interface EffectivePolicy {
  /**
   * Model IDs this policy allows.
   * EMPTY ARRAY = all models permitted (no allowlist enforced).
   * NON-EMPTY = strict allowlist; requests for unlisted models are rejected.
   *
   * Cascade behaviour: higher-level policies always win, including when they
   * carry an empty array. An individual policy with [] will override a team
   * restriction — use this intentionally to grant unrestricted access.
   */
  allowedEngines: string[];
  config: PolicyConfig;
  resolvedFrom: PolicyResolvedFrom;
}

export interface SimulateResult {
  allowed: boolean;
  fallbackApplied: boolean;
  fallbackModel: string | null;
  budgetRemaining: number;
  rateLimit: number;
  effectivePolicy: EffectivePolicy;
}

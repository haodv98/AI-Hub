import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PricingService } from './pricing.service';
import { MetricsService } from '../metrics/metrics.service';

export interface PolicyLimits {
  monthlyBudgetUsd: number;
  fallback?: {
    thresholdPct: number;
    fromModel: string | null;
    toModel: string | null;
  };
}

export interface BudgetCheckResult {
  allowed: boolean;
  currentCostUsd: number;
  budgetCapUsd: number;
  usagePct: number;
  fallbackModel?: string;
}

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly pricing: PricingService,
    private readonly metrics: MetricsService,
  ) {}

  async checkAndEnforceBudget(
    userId: string,
    teamId: string | null,
    requestedModel: string,
    policy: PolicyLimits,
  ): Promise<BudgetCheckResult> {
    const month = monthKey();
    const userKey = `budget:user:${userId}:cost_month:${month}`;

    let currentCost = 0;
    try {
      const raw = await this.redis.get(userKey);
      currentCost = raw ? parseFloat(raw) : 0;
    } catch {
      // Redis down: allow with warning
      this.logger.warn(`Budget Redis read failed for user ${userId} — allowing`);
      return {
        allowed: true,
        currentCostUsd: 0,
        budgetCapUsd: policy.monthlyBudgetUsd,
        usagePct: 0,
      };
    }

    const cap = policy.monthlyBudgetUsd;
    const usagePct = cap > 0 ? (currentCost / cap) * 100 : 0;
    if (teamId && cap > 0) {
      this.metrics.setTeamBudgetUsage(teamId, usagePct);
    }

    // Check fallback threshold (e.g. 90%)
    if (
      policy.fallback?.thresholdPct &&
      usagePct >= policy.fallback.thresholdPct &&
      policy.fallback.fromModel === requestedModel &&
      policy.fallback.toModel
    ) {
      return {
        allowed: true,
        currentCostUsd: currentCost,
        budgetCapUsd: cap,
        usagePct,
        fallbackModel: policy.fallback.toModel,
      };
    }

    // Over budget: deny
    if (cap > 0 && currentCost >= cap) {
      return {
        allowed: false,
        currentCostUsd: currentCost,
        budgetCapUsd: cap,
        usagePct,
      };
    }

    return {
      allowed: true,
      currentCostUsd: currentCost,
      budgetCapUsd: cap,
      usagePct,
    };
  }

  async recordActualCost(userId: string, teamId: string | null, costUsd: number): Promise<void> {
    const month = monthKey();

    try {
      const userKey = `budget:user:${userId}:cost_month:${month}`;
      await this.redis.incrbyfloat(userKey, costUsd);
      await this.redis.expire(userKey, 35 * 24 * 60 * 60); // 35 days TTL

      if (teamId) {
        const teamKey = `budget:team:${teamId}:cost_month:${month}`;
        await this.redis.incrbyfloat(teamKey, costUsd);
        await this.redis.expire(teamKey, 35 * 24 * 60 * 60);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to record cost for user ${userId}: ${message}`);
    }
  }

  async getUserMonthlyCost(userId: string): Promise<number> {
    const key = `budget:user:${userId}:cost_month:${monthKey()}`;
    const raw = await this.redis.get(key);
    return raw ? parseFloat(raw) : 0;
  }

  async getTeamMonthlyCost(teamId: string): Promise<number> {
    const key = `budget:team:${teamId}:cost_month:${monthKey()}`;
    const raw = await this.redis.get(key);
    return raw ? parseFloat(raw) : 0;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const BUDGET_THRESHOLDS = [70, 90, 100] as const;
type Threshold = (typeof BUDGET_THRESHOLDS)[number];

function today(): string {
  return new Date().toISOString().split('T')[0];
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── User Budget Alerts ─────────────────────────────────────────────────────

  async checkUserBudgetThresholds(
    userId: string,
    teamId: string | null,
    currentCostUsd: number,
    budgetCapUsd: number,
  ): Promise<void> {
    if (budgetCapUsd <= 0) return;

    const pct = (currentCostUsd / budgetCapUsd) * 100;
    const date = today();

    for (const threshold of BUDGET_THRESHOLDS) {
      if (pct < threshold) continue;

      const debounceKey = `alert:user:${userId}:${threshold}:${date}`;
      const isNew = await this.redis.setNx(debounceKey, '1', 24 * 60 * 60);
      if (!isNew) continue; // already alerted today at this threshold

      await this.persistAlert({
        userId,
        teamId,
        alertType: `BUDGET_${threshold}`,
        threshold,
        currentCost: currentCostUsd,
        budgetCap: budgetCapUsd,
      });

      this.logger.warn(
        `Budget alert ${threshold}% for user ${userId}: $${currentCostUsd.toFixed(2)} / $${budgetCapUsd.toFixed(2)}`,
      );
    }
  }

  // ── Team Budget Alerts ─────────────────────────────────────────────────────

  async checkTeamBudgetThresholds(
    teamId: string,
    currentCostUsd: number,
    budgetCapUsd: number,
  ): Promise<void> {
    if (budgetCapUsd <= 0) return;

    const pct = (currentCostUsd / budgetCapUsd) * 100;
    const date = today();

    for (const threshold of BUDGET_THRESHOLDS) {
      if (pct < threshold) continue;

      const debounceKey = `alert:team:${teamId}:${threshold}:${date}`;
      const isNew = await this.redis.setNx(debounceKey, '1', 24 * 60 * 60);
      if (!isNew) continue;

      await this.persistAlert({
        userId: null,
        teamId,
        alertType: `TEAM_BUDGET_${threshold}` as string,
        threshold,
        currentCost: currentCostUsd,
        budgetCap: budgetCapUsd,
      });

      this.logger.warn(
        `Team budget alert ${threshold}% for team ${teamId}: $${currentCostUsd.toFixed(2)} / $${budgetCapUsd.toFixed(2)}`,
      );
    }
  }

  // ── Spike Detection ────────────────────────────────────────────────────────
  // Compares today's spend against 7-day rolling average from usage_daily

  async checkSpikeDetection(teamId: string, todaySpendUsd: number): Promise<void> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const rows = await this.prisma.$queryRaw<Array<{ avg_cost: number | null }>>`
        SELECT AVG(cost_usd)::float AS avg_cost
        FROM usage_daily
        WHERE team_id::text = ${teamId}
          AND bucket >= ${sevenDaysAgo}
          AND bucket < NOW()::date
      `;

      const rawAvg = rows[0]?.avg_cost;
      // Guard against NULL (no history) or NaN (driver returns numeric as string in some versions)
      const avgCost = rawAvg != null ? Number(rawAvg) : 0;
      if (!Number.isFinite(avgCost) || avgCost <= 0) return;

      const spikeMultiple = todaySpendUsd / avgCost;
      if (!Number.isFinite(spikeMultiple) || spikeMultiple < 3) return;

      const debounceKey = `alert:team:${teamId}:spike:${today()}`;
      const isNew = await this.redis.setNx(debounceKey, '1', 24 * 60 * 60);
      if (!isNew) return;

      await this.persistAlert({
        userId: null,
        teamId,
        alertType: 'SPIKE',
        threshold: null,
        currentCost: todaySpendUsd,
        budgetCap: avgCost,
      });

      this.logger.warn(
        `Spike detected for team ${teamId}: today $${todaySpendUsd.toFixed(2)} = ${spikeMultiple.toFixed(1)}x 7-day avg $${avgCost.toFixed(2)}`,
      );
    } catch (err: unknown) {
      // Spike detection is non-critical; log and continue
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Spike detection failed for team ${teamId}: ${message}`);
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private async persistAlert(data: {
    userId: string | null;
    teamId: string | null;
    alertType: string;
    threshold: Threshold | null;
    currentCost: number;
    budgetCap: number;
  }): Promise<void> {
    try {
      await this.prisma.alertLog.create({
        data: {
          userId: data.userId,
          teamId: data.teamId,
          alertType: data.alertType,
          threshold: data.threshold,
          currentCost: data.currentCost,
          budgetCap: data.budgetCap,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to persist alert: ${message}`);
    }
  }
}

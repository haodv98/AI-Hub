import { Injectable, Logger } from '@nestjs/common';
import { TeamMemberTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EmailService } from '../integrations/email/email.service';
import { EMAIL_TEMPLATES } from '../integrations/email/email.types';

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
    private readonly email: EmailService,
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
      try {
        await this.email.sendToUser(userId, EMAIL_TEMPLATES.BUDGET_ALERT, {
          threshold,
          currentCost: currentCostUsd.toFixed(2),
          budgetCap: budgetCapUsd.toFixed(2),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to send user budget alert email: ${message}`);
      }
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
      try {
        await this.notifyTeamBudgetAlert({
          teamId,
          threshold,
          currentCostUsd,
          budgetCapUsd,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to send team budget alert email: ${message}`);
      }
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
      await this.email.sendToGroup('ops', EMAIL_TEMPLATES.SPIKE_DETECTED, {
        teamId,
        currentCost: todaySpendUsd.toFixed(2),
        baselineCost: avgCost.toFixed(2),
        spikeMultiple: spikeMultiple.toFixed(2),
      });
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

  private async notifyTeamBudgetAlert(data: {
    teamId: string;
    threshold: Threshold;
    currentCostUsd: number;
    budgetCapUsd: number;
  }): Promise<void> {
    const leads = await this.prisma.teamMember.findMany({
      where: { teamId: data.teamId, tier: TeamMemberTier.LEAD },
      select: { userId: true },
    });

    const leadResults = await Promise.allSettled(
      leads.map((lead) =>
        this.email.sendToUser(lead.userId, EMAIL_TEMPLATES.TEAM_BUDGET_ALERT, {
          teamId: data.teamId,
          threshold: data.threshold,
          currentCost: data.currentCostUsd.toFixed(2),
          budgetCap: data.budgetCapUsd.toFixed(2),
        }),
      ),
    );
    const failedLeadNotifications = leadResults.filter((result) => result.status === 'rejected');
    if (failedLeadNotifications.length > 0) {
      this.logger.warn(
        `${failedLeadNotifications.length}/${leads.length} lead notifications failed for team ${data.teamId}`,
      );
    }

    await this.email.sendToGroup('ops', EMAIL_TEMPLATES.TEAM_BUDGET_ALERT, {
      teamId: data.teamId,
      threshold: data.threshold,
      currentCost: data.currentCostUsd.toFixed(2),
      budgetCap: data.budgetCapUsd.toFixed(2),
    });
  }
}

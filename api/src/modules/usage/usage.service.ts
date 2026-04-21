import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetService } from '../budget/budget.service';
import { AlertsService } from '../alerts/alerts.service';
import {
  DailySummaryRow,
  OrgSummary,
  TeamSummaryRow,
  UsageByModelRow,
  UsageEvent,
  UsageSummaryRow,
} from './usage.types';

// Attempt 0 = first try; retries happen at attempt 1, 2, …, MAX_RETRY_ATTEMPTS
const MAX_RETRY_ATTEMPTS = 3;
const SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000;

@Injectable()
export class UsageService implements OnApplicationShutdown {
  private readonly logger = new Logger(UsageService.name);
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: BudgetService,
    private readonly alerts: AlertsService,
  ) {}

  // ── Event Recording ────────────────────────────────────────────────────────

  recordEvent(event: UsageEvent): void {
    const p = this.persistWithRetry(event, 0).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Usage event permanently failed after ${MAX_RETRY_ATTEMPTS} retries: ${message}`);
    });
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
  }

  // Drain in-flight writes on graceful shutdown so events aren't lost
  async onApplicationShutdown(): Promise<void> {
    if (this.pending.size === 0) return;
    this.logger.log(`Draining ${this.pending.size} pending usage events…`);

    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Drain timeout')), SHUTDOWN_DRAIN_TIMEOUT_MS),
    );

    try {
      await Promise.race([Promise.allSettled([...this.pending]), timeout]);
    } catch {
      this.logger.warn('Usage drain timed out — some events may be lost');
    }
  }

  private async persistWithRetry(event: UsageEvent, attempt: number): Promise<void> {
    try {
      await this.persistEvent(event);
    } catch (err: unknown) {
      if (attempt >= MAX_RETRY_ATTEMPTS) throw err;
      const delayMs = (attempt + 1) * 500; // 500ms, 1000ms, 1500ms
      await new Promise((r) => setTimeout(r, delayMs));
      return this.persistWithRetry(event, attempt + 1);
    }
  }

  private async persistEvent(event: UsageEvent): Promise<void> {
    // 1. Write to usage_events TimescaleDB hypertable
    await this.prisma.$executeRaw`
      INSERT INTO usage_events (
        time, user_id, team_id, api_key_id,
        model, provider,
        prompt_tokens, completion_tokens, total_tokens,
        cost_usd, latency_ms
      ) VALUES (
        NOW(), ${event.userId}, ${event.teamId ?? null}::text, ${event.apiKeyId},
        ${event.model}, ${event.provider},
        ${event.promptTokens}, ${event.completionTokens}, ${event.totalTokens},
        ${event.costUsd}, ${event.latencyMs ?? null}::integer
      )
    `;

    // 2. Update Redis budget counters
    await this.budget.recordActualCost(event.userId, event.teamId, event.costUsd);

    // 3. Update ApiKey.lastUsedAt — non-critical, independent failure
    this.prisma.apiKey
      .update({ where: { id: event.apiKeyId }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    // 4. Alert checks — non-critical, run after successful persist
    this.runAlertChecks(event).catch(() => {});
  }

  private async runAlertChecks(event: UsageEvent): Promise<void> {
    if (!event.teamId) return;
    try {
      const team = await this.prisma.team.findUnique({
        where: { id: event.teamId },
        select: { monthlyBudgetUsd: true },
      });
      if (!team?.monthlyBudgetUsd) return;

      const teamCost = await this.budget.getTeamMonthlyCost(event.teamId);
      await this.alerts.checkTeamBudgetThresholds(
        event.teamId,
        teamCost,
        team.monthlyBudgetUsd,
      );
      await this.alerts.checkSpikeDetection(event.teamId, teamCost);
    } catch {
      // Non-critical: swallow silently
    }
  }

  // ── Query Endpoints ────────────────────────────────────────────────────────

  async getUserUsage(
    userId: string,
    from: Date,
    to: Date,
    groupBy?: string,
  ): Promise<UsageByModelRow[] | UsageSummaryRow[]> {
    if (groupBy === 'model') {
      return this.prisma.$queryRaw<UsageByModelRow[]>`
        SELECT
          model,
          SUM(prompt_tokens)::int      AS "promptTokens",
          SUM(completion_tokens)::int  AS "completionTokens",
          SUM(total_tokens)::int       AS "totalTokens",
          SUM(cost_usd)::float         AS "costUsd",
          COUNT(*)::int                AS "requestCount"
        FROM usage_hourly
        WHERE user_id::text = ${userId}
          AND bucket >= ${from}
          AND bucket <= ${to}
        GROUP BY model
        ORDER BY "costUsd" DESC
      `;
    }

    return this.prisma.$queryRaw<UsageSummaryRow[]>`
      SELECT
        DATE_TRUNC('day', bucket)    AS date,
        SUM(cost_usd)::float         AS "costUsd",
        SUM(total_tokens)::int       AS "totalTokens",
        COUNT(*)::int                AS "requestCount"
      FROM usage_hourly
      WHERE user_id::text = ${userId}
        AND bucket >= ${from}
        AND bucket <= ${to}
      GROUP BY date
      ORDER BY date
    `;
  }

  async getTeamUsage(teamId: string, from: Date, to: Date): Promise<UsageSummaryRow[]> {
    return this.prisma.$queryRaw<UsageSummaryRow[]>`
      SELECT
        DATE_TRUNC('day', bucket)    AS date,
        SUM(cost_usd)::float         AS "costUsd",
        SUM(total_tokens)::int       AS "totalTokens",
        COUNT(*)::int                AS "requestCount"
      FROM usage_daily
      WHERE team_id::text = ${teamId}
        AND bucket >= ${from}
        AND bucket <= ${to}
      GROUP BY date
      ORDER BY date
    `;
  }

  async getOrgSummary(from: Date, to: Date): Promise<OrgSummary> {
    const [totals, daily, byTeam] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        total_cost: number | null;
        total_tokens: number | null;
        total_requests: number | null;
        team_count: number | null;
      }>>`
        SELECT
          SUM(cost_usd)::float           AS total_cost,
          SUM(total_tokens)::int         AS total_tokens,
          COUNT(*)::int                  AS total_requests,
          COUNT(DISTINCT team_id)::int   AS team_count
        FROM usage_daily
        WHERE bucket >= ${from}
          AND bucket <= ${to}
      `,
      this.prisma.$queryRaw<Array<{
        date: Date;
        cost_usd: number;
        total_tokens: number;
        request_count: number;
      }>>`
        SELECT
          DATE_TRUNC('day', bucket)    AS date,
          SUM(cost_usd)::float         AS cost_usd,
          SUM(total_tokens)::int       AS total_tokens,
          COUNT(*)::int                AS request_count
        FROM usage_daily
        WHERE bucket >= ${from}
          AND bucket <= ${to}
        GROUP BY DATE_TRUNC('day', bucket)
        ORDER BY date
      `,
      this.prisma.$queryRaw<Array<{
        team_id: string;
        team_name: string;
        cost_usd: number;
        total_tokens: number;
        request_count: number;
      }>>`
        SELECT
          ud.team_id,
          t.name                       AS team_name,
          SUM(ud.cost_usd)::float      AS cost_usd,
          SUM(ud.total_tokens)::int    AS total_tokens,
          COUNT(*)::int                AS request_count
        FROM usage_daily ud
        JOIN teams t ON t.id = ud.team_id::text
        WHERE ud.bucket >= ${from}
          AND ud.bucket <= ${to}
          AND ud.team_id IS NOT NULL
        GROUP BY ud.team_id, t.name
        ORDER BY cost_usd DESC
        LIMIT 5
      `,
    ]);

    const row = totals[0];
    return {
      totalCost: Number(row?.total_cost ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      totalRequests: Number(row?.total_requests ?? 0),
      teamCount: Number(row?.team_count ?? 0),
      byDay: daily.map((d): DailySummaryRow => ({
        date: new Date(d.date).toISOString().split('T')[0],
        costUsd: Number(d.cost_usd),
        totalTokens: Number(d.total_tokens),
        requestCount: Number(d.request_count),
      })),
      byTeam: byTeam.map((t): TeamSummaryRow => ({
        teamId: t.team_id,
        teamName: t.team_name,
        costUsd: Number(t.cost_usd),
        totalTokens: Number(t.total_tokens),
        requestCount: Number(t.request_count),
      })),
    };
  }

  async checkUserAlerts(
    userId: string,
    teamId: string | null,
    currentCostUsd: number,
    budgetCapUsd: number,
  ): Promise<void> {
    await this.alerts.checkUserBudgetThresholds(userId, teamId, currentCostUsd, budgetCapUsd);
  }
}

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
  ModelUsageRow,
  OrgSummary,
  ProviderBreakdownRow,
  TeamSummaryRow,
  TeamUsageRow,
  TopUserRow,
  UsageExportSummary,
  UsageHeatmapRow,
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
  private aggregateViewAvailability: boolean | null = null;

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
        created_at, user_id, team_id, api_key_id,
        model, provider,
        requested_model, is_fallback,
        prompt_tokens, completion_tokens, total_tokens,
        cost_usd, latency_ms, status
      ) VALUES (
        NOW(), ${event.userId}, ${event.teamId ?? null}::text, ${event.apiKeyId},
        ${event.model}, ${event.provider},
        ${event.model}, false,
        ${event.promptTokens}, ${event.completionTokens}, ${event.totalTokens},
        ${event.costUsd}, ${event.latencyMs ?? null}::integer, 'success'
      )
    `;

    // 2. Update Redis budget counters
    await this.budget.recordActualCost(event.userId, event.teamId, event.costUsd);

    // 3. Update ApiKey.lastUsedAt — non-critical, independent failure
    this.prisma.apiKey
      .update({ where: { id: event.apiKeyId }, data: { lastUsedAt: new Date() } })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to update apiKey.lastUsedAt for ${event.apiKeyId}: ${message}`);
      });

    // 4. Alert checks — non-critical, run after successful persist
    this.runAlertChecks(event).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to run alert checks for team ${event.teamId ?? 'n/a'}: ${message}`);
    });
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
    const useAggregates = await this.canUseAggregateViews();

    if (groupBy === 'model') {
      if (!useAggregates) {
        return this.prisma.$queryRaw<UsageByModelRow[]>`
          SELECT
            model,
            SUM(prompt_tokens)::int      AS "promptTokens",
            SUM(completion_tokens)::int  AS "completionTokens",
            SUM(total_tokens)::int       AS "totalTokens",
            SUM(cost_usd)::float         AS "costUsd",
            COUNT(*)::int                AS "requestCount"
          FROM usage_events
          WHERE user_id::text = ${userId}
            AND created_at >= ${from}
            AND created_at <= ${to}
          GROUP BY model
          ORDER BY "costUsd" DESC
        `;
      }

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

    if (!useAggregates) {
      return this.prisma.$queryRaw<UsageSummaryRow[]>`
        SELECT
          DATE_TRUNC('day', created_at) AS date,
          SUM(cost_usd)::float          AS "costUsd",
          SUM(total_tokens)::int        AS "totalTokens",
          COUNT(*)::int                 AS "requestCount"
        FROM usage_events
        WHERE user_id::text = ${userId}
          AND created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date
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
    const useAggregates = await this.canUseAggregateViews();
    if (!useAggregates) {
      return this.prisma.$queryRaw<UsageSummaryRow[]>`
        SELECT
          DATE_TRUNC('day', created_at) AS date,
          SUM(cost_usd)::float          AS "costUsd",
          SUM(total_tokens)::int        AS "totalTokens",
          COUNT(*)::int                 AS "requestCount"
        FROM usage_events
        WHERE team_id::text = ${teamId}
          AND created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date
      `;
    }

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
    const msRange = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - msRange);
    const previousTo = new Date(to.getTime() - msRange);

    const [
      totals,
      daily,
      byTeam,
      providerBreakdown,
      modelUsage,
      topUsers,
      topUsersPrevious,
      avgLatency,
      teamUsageCurrent,
      totalsPrevious,
      teamMeta,
    ] = await Promise.all([
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
      this.prisma.$queryRaw<Array<{ provider: string; value: number }>>`
        SELECT
          provider,
          SUM(cost_usd)::float AS value
        FROM usage_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY provider
        ORDER BY value DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{ model: string; request_count: number }>>`
        SELECT
          model,
          COUNT(*)::int AS request_count
        FROM usage_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY model
        ORDER BY request_count DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{
        user_id: string;
        user_name: string | null;
        team_name: string | null;
        spend_usd: number;
        tokens: number;
      }>>`
        SELECT
          ue.user_id::text AS user_id,
          u.full_name AS user_name,
          COALESCE(t.name, 'Unassigned') AS team_name,
          SUM(ue.cost_usd)::float AS spend_usd,
          SUM(ue.total_tokens)::int AS tokens
        FROM usage_events ue
        LEFT JOIN users u ON u.id = ue.user_id::text
        LEFT JOIN teams t ON t.id = ue.team_id::text
        WHERE ue.created_at >= ${from}
          AND ue.created_at <= ${to}
        GROUP BY ue.user_id, u.full_name, t.name
        ORDER BY spend_usd DESC
        LIMIT 5
      `,
      this.prisma.$queryRaw<Array<{ user_id: string; spend_usd: number }>>`
        SELECT
          ue.user_id::text AS user_id,
          SUM(ue.cost_usd)::float AS spend_usd
        FROM usage_events ue
        WHERE ue.created_at >= ${previousFrom}
          AND ue.created_at <= ${previousTo}
        GROUP BY ue.user_id
      `,
      this.prisma.$queryRaw<Array<{ avg_ms: number | null }>>`
        SELECT AVG(latency_ms)::float AS avg_ms
        FROM usage_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}
      `,
      this.prisma.$queryRaw<Array<{ team_id: string; spend_usd: number }>>`
        SELECT
          team_id::text AS team_id,
          SUM(cost_usd)::float AS spend_usd
        FROM usage_daily
        WHERE bucket >= ${from}
          AND bucket <= ${to}
          AND team_id IS NOT NULL
        GROUP BY team_id
      `,
      this.prisma.$queryRaw<Array<{
        total_cost: number | null;
        total_tokens: number | null;
        total_requests: number | null;
      }>>`
        SELECT
          SUM(cost_usd)::float AS total_cost,
          SUM(total_tokens)::int AS total_tokens,
          COUNT(*)::int AS total_requests
        FROM usage_daily
        WHERE bucket >= ${previousFrom}
          AND bucket <= ${previousTo}
      `,
      this.prisma.team.findMany({
        select: {
          id: true,
          monthlyBudgetUsd: true,
          _count: { select: { members: true } },
        },
      }),
    ]);

    const row = totals[0];
    const previous = totalsPrevious[0];
    const previousTopUsersById = new Map(
      topUsersPrevious.map((item) => [item.user_id, Number(item.spend_usd)]),
    );
    const memberCountByTeam = new Map(
      teamMeta.map((team) => [
        team.id,
        { members: team._count.members, budget: team.monthlyBudgetUsd },
      ]),
    );

    const calcGrowth = (current: number, prev: number) => {
      if (prev <= 0) return current > 0 ? 100 : 0;
      return ((current - prev) / prev) * 100;
    };

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
      providerBreakdown: providerBreakdown.map((item): ProviderBreakdownRow => ({
        provider: item.provider,
        value: Number(item.value),
      })),
      modelUsage: modelUsage.map((item): ModelUsageRow => ({
        model: item.model,
        requestCount: Number(item.request_count),
      })),
      topUsers: topUsers.map((user): TopUserRow => {
        const previousUser = previousTopUsersById.get(user.user_id) ?? 0;
        return {
          userId: user.user_id,
          name: user.user_name ?? 'Unknown user',
          team: user.team_name ?? 'Unassigned',
          spendUsd: Number(user.spend_usd),
          tokens: Number(user.tokens),
          growthPct: Number(calcGrowth(Number(user.spend_usd), previousUser).toFixed(2)),
        };
      }),
      latency: {
        avgMs: Number(avgLatency[0]?.avg_ms ?? 0),
      },
      teamUsage: teamUsageCurrent.map((item): TeamUsageRow => {
        const meta = memberCountByTeam.get(item.team_id);
        const spend = Number(item.spend_usd);
        const budget = Number(meta?.budget ?? 0);
        return {
          teamId: item.team_id,
          spendUsd: spend,
          utilizationPct: Number((budget > 0 ? (spend / budget) * 100 : 0).toFixed(2)),
          members: meta?.members ?? 0,
        };
      }),
      trends: {
        spendPct: Number(
          calcGrowth(Number(row?.total_cost ?? 0), Number(previous?.total_cost ?? 0)).toFixed(2),
        ),
        tokensPct: Number(
          calcGrowth(Number(row?.total_tokens ?? 0), Number(previous?.total_tokens ?? 0)).toFixed(2),
        ),
        requestsPct: Number(
          calcGrowth(Number(row?.total_requests ?? 0), Number(previous?.total_requests ?? 0)).toFixed(2),
        ),
      },
    };
  }

  async getUsageHeatmap(from: Date, to: Date): Promise<UsageHeatmapRow[]> {
    return this.prisma.$queryRaw<UsageHeatmapRow[]>`
      SELECT
        EXTRACT(DOW FROM created_at)::int  AS "dayOfWeek",
        EXTRACT(HOUR FROM created_at)::int AS "hourOfDay",
        COUNT(*)::int                      AS "requestCount"
      FROM usage_events
      WHERE created_at >= ${from}
        AND created_at <= ${to}
      GROUP BY "dayOfWeek", "hourOfDay"
      ORDER BY "dayOfWeek", "hourOfDay"
    `;
  }

  async getExportSummary(from: Date, to: Date): Promise<UsageExportSummary> {
    const [totals, byTeam, byProvider] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total_cost_usd: number | null; total_requests: number | null }>>`
        SELECT
          SUM(cost_usd)::float AS total_cost_usd,
          COUNT(*)::int        AS total_requests
        FROM usage_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}
      `,
      this.prisma.$queryRaw<Array<{ team_name: string | null; cost_usd: number; request_count: number }>>`
        SELECT
          t.name                  AS team_name,
          SUM(ue.cost_usd)::float AS cost_usd,
          COUNT(*)::int           AS request_count
        FROM usage_events ue
        LEFT JOIN teams t ON t.id = ue.team_id::text
        WHERE ue.created_at >= ${from}
          AND ue.created_at <= ${to}
        GROUP BY t.name
        ORDER BY cost_usd DESC
      `,
      this.prisma.$queryRaw<Array<{ provider: string; cost_usd: number; request_count: number }>>`
        SELECT
          provider,
          SUM(cost_usd)::float AS cost_usd,
          COUNT(*)::int        AS request_count
        FROM usage_events
        WHERE created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY provider
        ORDER BY cost_usd DESC
      `,
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totalCostUsd: Number(totals[0]?.total_cost_usd ?? 0),
      totalRequests: Number(totals[0]?.total_requests ?? 0),
      byTeam: byTeam.map((row) => ({
        teamName: row.team_name ?? 'Unassigned',
        costUsd: Number(row.cost_usd),
        requestCount: Number(row.request_count),
      })),
      byProvider: byProvider.map((row) => ({
        provider: row.provider,
        costUsd: Number(row.cost_usd),
        requestCount: Number(row.request_count),
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

  private async canUseAggregateViews(): Promise<boolean> {
    if (this.aggregateViewAvailability !== null) return this.aggregateViewAvailability;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ hourly_exists: string | null; daily_exists: string | null }>>`
        SELECT
          to_regclass('usage_hourly')::text AS hourly_exists,
          to_regclass('usage_daily')::text AS daily_exists
      `;
      this.aggregateViewAvailability = Boolean(rows[0]?.hourly_exists && rows[0]?.daily_exists);
    } catch {
      this.aggregateViewAvailability = false;
    }

    if (!this.aggregateViewAvailability) {
      this.logger.warn('usage_hourly/usage_daily not found; fallback to usage_events raw queries');
    }
    return this.aggregateViewAvailability;
  }
}

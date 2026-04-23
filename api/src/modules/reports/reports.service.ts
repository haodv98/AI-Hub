import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../integrations/email/email.service';
import { EMAIL_TEMPLATES } from '../integrations/email/email.types';

const REPORT_RECIPIENT_GROUP = 'report_recipients' as const;

export interface MonthlyReportDeliveryInput {
  month: string;
  totalSpendUsd: number;
  reportUrl?: string;
}

export interface MonthlyReportItem {
  month: string;
  generatedAt: string;
  totalSpendUsd: number;
  status: 'ready';
}

export interface CurrentMonthReportPreview {
  month: string;
  totalSpendUsd: number;
  totalRequests: number;
  averageLatencyMs: number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private usageDailyAvailability: boolean | null = null;
  private usageEventsAvailability: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async deliverMonthlyReport(input: MonthlyReportDeliveryInput): Promise<{
    deliveredToAdmins: number;
    deliveredToRecipients: boolean;
  }> {
    const admins = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.IT_ADMIN, UserRole.SUPER_ADMIN] },
      },
      select: { id: true },
    });

    const adminDelivery = await Promise.allSettled(
      admins.map((admin) =>
        this.email.sendToUser(admin.id, EMAIL_TEMPLATES.MONTHLY_REPORT_READY, {
          month: input.month,
          totalSpendUsd: input.totalSpendUsd.toFixed(2),
          reportUrl: input.reportUrl ?? null,
        }),
      ),
    );

    const deliveredToAdmins = adminDelivery.filter((result) => result.status === 'fulfilled').length;
    if (deliveredToAdmins !== admins.length) {
      this.logger.warn(
        `Monthly report admin delivery partial failure: ${deliveredToAdmins}/${admins.length}`,
      );
    }

    try {
      await this.email.sendToGroup(REPORT_RECIPIENT_GROUP, EMAIL_TEMPLATES.MONTHLY_REPORT_READY, {
        month: input.month,
        totalSpendUsd: input.totalSpendUsd.toFixed(2),
        reportUrl: input.reportUrl ?? null,
      });
      return { deliveredToAdmins, deliveredToRecipients: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Monthly report recipient group delivery failed: ${message}`);
      return { deliveredToAdmins, deliveredToRecipients: false };
    }
  }

  async listMonthlyReports(limit = 12): Promise<MonthlyReportItem[]> {
    const useDaily = await this.canUseUsageDaily();
    const useEvents = await this.canUseUsageEvents();
    if (!useDaily && !useEvents) return [];

    const rows = useDaily
      ? await this.prisma.$queryRaw<Array<{ month_bucket: Date; generated_at: Date; total_spend_usd: number }>>`
          SELECT
            DATE_TRUNC('month', bucket) AS month_bucket,
            MAX(bucket)                 AS generated_at,
            SUM(cost_usd)::float        AS total_spend_usd
          FROM usage_daily
          GROUP BY DATE_TRUNC('month', bucket)
          ORDER BY month_bucket DESC
          LIMIT ${limit}
        `
      : await this.prisma.$queryRaw<Array<{ month_bucket: Date; generated_at: Date; total_spend_usd: number }>>`
          SELECT
            DATE_TRUNC('month', created_at) AS month_bucket,
            MAX(created_at)                 AS generated_at,
            SUM(cost_usd)::float            AS total_spend_usd
          FROM usage_events
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY month_bucket DESC
          LIMIT ${limit}
        `;

    return rows.map((row) => ({
      month: row.month_bucket.toISOString().slice(0, 7),
      generatedAt: row.generated_at.toISOString(),
      totalSpendUsd: Number(row.total_spend_usd ?? 0),
      status: 'ready',
    }));
  }

  async getCurrentMonthPreview(from?: Date, to?: Date): Promise<CurrentMonthReportPreview> {
    const rangeFrom = from ?? startOfMonth(new Date());
    const rangeTo = to ?? new Date();
    const useDaily = await this.canUseUsageDaily();
    const useEvents = await this.canUseUsageEvents();
    if (!useDaily && !useEvents) {
      return {
        month: rangeFrom.toISOString().slice(0, 7),
        totalSpendUsd: 0,
        totalRequests: 0,
        averageLatencyMs: 0,
      };
    }

    const [summary] = useDaily
      ? await this.prisma.$queryRaw<Array<{ total_spend_usd: number | null; total_requests: number | null; avg_latency_ms: number | null }>>`
          SELECT
            SUM(cost_usd)::float      AS total_spend_usd,
            SUM(request_count)::int   AS total_requests,
            NULL::float               AS avg_latency_ms
          FROM usage_daily
          WHERE bucket >= ${rangeFrom}
            AND bucket <= ${rangeTo}
        `
      : await this.prisma.$queryRaw<Array<{ total_spend_usd: number | null; total_requests: number | null; avg_latency_ms: number | null }>>`
          SELECT
            SUM(cost_usd)::float    AS total_spend_usd,
            COUNT(*)::int           AS total_requests,
            AVG(latency_ms)::float  AS avg_latency_ms
          FROM usage_events
          WHERE created_at >= ${rangeFrom}
            AND created_at <= ${rangeTo}
        `;

    return {
      month: rangeFrom.toISOString().slice(0, 7),
      totalSpendUsd: Number(summary?.total_spend_usd ?? 0),
      totalRequests: Number(summary?.total_requests ?? 0),
      averageLatencyMs: Number(summary?.avg_latency_ms ?? 0),
    };
  }

  @Cron('0 6 1 * *')
  async runMonthlyReportJob(): Promise<void> {
    const now = new Date();
    const previousMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const month = previousMonthStart.toISOString().slice(0, 7);
    const preview = await this.getCurrentMonthPreview(previousMonthStart, previousMonthEnd);
    await this.deliverMonthlyReport({
      month,
      totalSpendUsd: preview.totalSpendUsd,
    });
    this.logger.log(`Monthly report job completed for ${month}`);
  }

  private async canUseUsageDaily(): Promise<boolean> {
    if (this.usageDailyAvailability !== null) return this.usageDailyAvailability;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: string | null }>>`
        SELECT to_regclass('usage_daily')::text AS exists
      `;
      this.usageDailyAvailability = Boolean(rows[0]?.exists);
    } catch {
      this.usageDailyAvailability = false;
    }
    return this.usageDailyAvailability;
  }

  private async canUseUsageEvents(): Promise<boolean> {
    if (this.usageEventsAvailability !== null) return this.usageEventsAvailability;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ exists: string | null }>>`
        SELECT to_regclass('usage_events')::text AS exists
      `;
      this.usageEventsAvailability = Boolean(rows[0]?.exists);
    } catch {
      this.usageEventsAvailability = false;
    }
    return this.usageEventsAvailability;
  }
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

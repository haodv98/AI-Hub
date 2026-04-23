import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

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
}

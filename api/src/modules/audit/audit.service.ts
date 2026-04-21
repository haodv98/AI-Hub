import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';

export interface AuditLogInput {
  actorId?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  log(input: AuditLogInput): void {
    // Async write — does not block HTTP response
    setImmediate(async () => {
      try {
        const data: Prisma.AuditLogUncheckedCreateInput = {
            action: input.action,
            actorId: input.actorId ?? null,
            targetType: input.targetType ?? null,
            targetId: input.targetId ?? null,
            details: input.details as Prisma.InputJsonValue ?? undefined,
            ipAddress: input.ipAddress ?? null,
          };
          await this.prisma.auditLog.create({ data });
      } catch (err) {
        this.logger.error(`Audit log write failed: ${err.message}`, { input });
      }
    });
  }
}

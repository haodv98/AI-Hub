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

export interface ListAuditLogsParams {
  q?: string;
  targetType?: string;
  userId?: string;
  teamId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Audit log write failed: ${message}`, { input });
      }
    });
  }

  async listLogs(params: ListAuditLogsParams) {
    const normalizedAction = params.q?.toUpperCase() as AuditAction | undefined;
    const actionFilter = normalizedAction && Object.values(AuditAction).includes(normalizedAction)
      ? { action: normalizedAction }
      : null;

    const where: Prisma.AuditLogWhereInput = {
      // userId/teamId filters take precedence over generic targetType
      ...(params.userId
        ? { targetId: params.userId, targetType: { equals: 'USER', mode: 'insensitive' } }
        : params.teamId
          ? { targetId: params.teamId, targetType: { equals: 'TEAM', mode: 'insensitive' } }
          : params.targetType
            ? { targetType: { equals: params.targetType, mode: 'insensitive' } }
            : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to   ? { lte: params.to   } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            OR: [
              { targetId: { contains: params.q, mode: 'insensitive' } },
              ...(actionFilter ? [actionFilter] : []),
              { actor: { fullName: { contains: params.q, mode: 'insensitive' } } },
              { actor: { email: { contains: params.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
    ]);

    return {
      total,
      rows: rows.map((item) => ({
        id: item.id,
        timestamp: item.createdAt.toISOString(),
        actor: {
          name: item.actor?.fullName ?? 'System',
          email: item.actor?.email ?? 'system@aihub.internal',
        },
        action: item.action,
        targetType: item.targetType ?? 'SYSTEM',
        targetId: item.targetId ?? '',
        details: (item.details as Record<string, unknown> | null) ?? {},
      })),
    };
  }
}

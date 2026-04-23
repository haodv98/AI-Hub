import { Injectable, Logger } from '@nestjs/common';
import { TeamMemberTier, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { KeysService } from '../../keys/keys.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../../audit/audit.service';
import { HR_DEFAULT_MAPPING, resolveTierFromTitle } from './hr-mapping.config';
import { HrWebhookEventDto } from './hr.dto';

type HrWebhookEvent = HrWebhookEventDto;

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly keys: KeysService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  async handleEvent(event: HrWebhookEvent): Promise<{ processed: boolean; deduped: boolean }> {
    const dedupeKey = `hr:event:${event.id}`;
    const deduped = !(await this.redis.setNx(dedupeKey, 'processing', 24 * 60 * 60));
    if (deduped) return { processed: false, deduped: true };

    try {
      if (event.type === 'employee.onboarded') {
        await this.handleOnboard(event.payload);
      } else if (event.type === 'employee.offboarded') {
        await this.handleOffboard(event.payload);
      } else if (event.type === 'employee.transferred') {
        await this.handleTransfer(event.payload);
      }
      await this.redis.set(dedupeKey, 'done', 24 * 60 * 60);
      return { processed: true, deduped: false };
    } catch (err) {
      await this.redis.del(dedupeKey);
      throw err;
    }
  }

  private async handleOnboard(payload: HrWebhookEvent['payload']): Promise<void> {
    if (!payload.email) throw new Error('Missing payload.email');
    const email = payload.email.toLowerCase();

    const teamResolution = await this.resolveTeam(payload.department);
    const titleTier = resolveTierFromTitle(payload.title);
    const tier = titleTier ?? teamResolution?.defaultTier ?? TeamMemberTier.MEMBER;

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true, status: true },
      });

      const userRecord =
        existing ??
        (await tx.user.create({
          data: {
            email,
            fullName: payload.fullName ?? email.split('@')[0],
            role: UserRole.MEMBER,
            status: UserStatus.ACTIVE,
          },
        }));

      if (existing && existing.status !== UserStatus.ACTIVE) {
        await tx.user.update({
          where: { id: existing.id },
          data: { status: UserStatus.ACTIVE, offboardedAt: null },
        });
      }

      if (teamResolution?.teamId) {
        await tx.teamMember.upsert({
          where: { userId_teamId: { userId: userRecord.id, teamId: teamResolution.teamId } },
          create: { userId: userRecord.id, teamId: teamResolution.teamId, tier, isPrimary: true },
          update: { tier, isPrimary: true },
        });
        await tx.teamMember.updateMany({
          where: { userId: userRecord.id, teamId: { not: teamResolution.teamId } },
          data: { isPrimary: false },
        });
      }

      return userRecord;
    });

    const existingKey = await this.keys.getMyKey(user.id);
    if (!existingKey) {
      const { key, plaintext } = await this.keys.generateKey(user.id, 'system');
      await this.email.sendOnboardingKeyDelivery({
        userId: user.id,
        email,
        keyId: key.id,
        keyPlaintext: plaintext,
      });
    }

    this.audit.log({
      actorId: 'system',
      action: 'USER_CREATE',
      targetType: 'User',
      targetId: user.id,
      details: { source: 'hr-webhook', event: 'employee.onboarded', email },
    });
  }

  private async handleOffboard(payload: HrWebhookEvent['payload']): Promise<void> {
    if (!payload.email) throw new Error('Missing payload.email');
    const email = payload.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;

    await this.keys.revokeAllUserKeys(user.id, 'system');
    await this.prisma.providerKey.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: UserStatus.OFFBOARDED, offboardedAt: new Date() },
    });

    this.audit.log({
      actorId: 'system',
      action: 'USER_OFFBOARD',
      targetType: 'User',
      targetId: user.id,
      details: { source: 'hr-webhook', event: 'employee.offboarded', email },
    });
  }

  private async handleTransfer(payload: HrWebhookEvent['payload']): Promise<void> {
    if (!payload.email) throw new Error('Missing payload.email');
    const email = payload.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;

    const teamResolution = await this.resolveTeam(payload.department);
    const titleTier = resolveTierFromTitle(payload.title);
    const tier = titleTier ?? teamResolution?.defaultTier ?? TeamMemberTier.MEMBER;
    if (!teamResolution?.teamId) {
      this.logger.warn(`HR transfer skipped: no team mapping for email=${email}`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.upsert({
        where: { userId_teamId: { userId: user.id, teamId: teamResolution.teamId } },
        create: { userId: user.id, teamId: teamResolution.teamId, tier, isPrimary: true },
        update: { tier, isPrimary: true },
      });
      await tx.teamMember.updateMany({
        where: { userId: user.id, teamId: { not: teamResolution.teamId } },
        data: { isPrimary: false },
      });
    });

    const existing = await this.keys.getMyKey(user.id);
    const key = existing
      ? await this.keys.rotateKey(existing.id, 'system')
      : await this.keys.generateKey(user.id, 'system');
    await this.email.sendOnboardingKeyDelivery({
      userId: user.id,
      email,
      keyId: key.key.id,
      keyPlaintext: key.plaintext,
    });

    this.audit.log({
      actorId: 'system',
      action: 'USER_UPDATE',
      targetType: 'User',
      targetId: user.id,
      details: { source: 'hr-webhook', event: 'employee.transferred', email, teamId: teamResolution.teamId, tier },
    });
  }

  private async resolveTeam(
    department?: string,
  ): Promise<{ teamId: string; defaultTier: TeamMemberTier } | null> {
    const normalized = (department ?? '').trim().toLowerCase();
    if (!normalized) return null;

    const mapping = HR_DEFAULT_MAPPING.find((rule) => rule.dept === normalized);
    if (mapping) {
      const team = await this.prisma.team.findFirst({
        where: { name: { equals: mapping.team, mode: 'insensitive' } },
        select: { id: true },
      });
      return team ? { teamId: team.id, defaultTier: mapping.defaultTier } : null;
    }

    const directMatch = await this.prisma.team.findFirst({
      where: { name: { equals: normalized, mode: 'insensitive' } },
      select: { id: true },
    });
    return directMatch ? { teamId: directMatch.id, defaultTier: TeamMemberTier.MEMBER } : null;
  }
}

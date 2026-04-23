import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import {
  ApiKey,
  ApiKeyStatus,
  Prisma,
  ProviderType,
  ProviderKeyScope,
  UserRole,
} from '@prisma/client';
import * as crypto from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OneTimeTokenService } from '../integrations/email/one-time-token.service';

const GRACE_PERIOD_HOURS = 72;
const KEY_CACHE_PREFIX = 'apikey:hash:';
const KEY_CACHE_TTL = 30; // seconds

export interface GeneratedKey {
  key: ApiKey;
  plaintext: string;
}

type ApiKeyWithUser = Prisma.ApiKeyGetPayload<{
  include: { user: { select: { email: true; fullName: true } } };
}>;

export interface ProviderRouteInfo {
  provider: ProviderType;
  scope: ProviderKeyScope | 'NONE';
  source: 'per-seat' | 'shared' | 'unconfigured';
}

export interface KeyWithRouting extends ApiKeyWithUser {
  providerRouting: ProviderRouteInfo[];
}

@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly oneTimeToken: OneTimeTokenService,
  ) {}

  async generateKey(userId: string, actorId: string, env = 'prod'): Promise<GeneratedKey> {
    const plaintext = `aihub_${env}_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = this.hashKey(plaintext);
    const keyPrefix = plaintext.slice(0, 20);

    const key = await this.prisma.apiKey.create({
      data: { userId, keyHash, keyPrefix, status: ApiKeyStatus.ACTIVE },
    });

    await this.audit.log({
      actorId,
      action: 'KEY_GENERATE',
      targetType: 'ApiKey',
      targetId: key.id,
      details: { userId, keyPrefix },
    });

    // Plaintext returned ONCE — never persisted
    return { key, plaintext };
  }

  async validateKey(plaintext: string): Promise<ApiKey | null> {
    const keyHash = this.hashKey(plaintext);
    const cacheKey = `${KEY_CACHE_PREFIX}${keyHash}`;

    // Check Redis cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.status !== ApiKeyStatus.ACTIVE && parsed.status !== ApiKeyStatus.ROTATING) {
        return null;
      }
      return parsed;
    }

    // DB fallback
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (!key) return null;

    if (key.status !== ApiKeyStatus.ACTIVE && key.status !== ApiKeyStatus.ROTATING) {
      return null;
    }

    // Cache valid key
    await this.redis.set(cacheKey, JSON.stringify(key), KEY_CACHE_TTL);

    // Update lastUsedAt async (best-effort — swallow errors)
    setImmediate(async () => {
      try {
        await this.prisma.apiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() },
        });
      } catch {
        // ignore — non-critical
      }
    });

    return key;
  }

  async rotateKey(keyId: string, actorId: string): Promise<GeneratedKey> {
    const oldKey = await this.prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!oldKey) throw new NotFoundException('API key not found');
    await this.assertCanManageKey(actorId, oldKey.userId);
    if (oldKey.status !== ApiKeyStatus.ACTIVE) {
      throw new ForbiddenException('Only ACTIVE keys can be rotated');
    }

    const plaintext = `aihub_prod_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = this.hashKey(plaintext);
    const keyPrefix = plaintext.slice(0, 20);
    const rotatedAt = new Date();

    const newKey = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          userId: oldKey.userId,
          keyHash,
          keyPrefix,
          status: ApiKeyStatus.ACTIVE,
          rotatedFromId: keyId,
        },
      });

      await tx.apiKey.update({
        where: { id: keyId },
        data: {
          status: ApiKeyStatus.ROTATING,
          rotatedAt,
        },
      });

      return created;
    });

    const newKeyResult: GeneratedKey = { key: newKey, plaintext };

    // Invalidate old key cache
    await this.redis.del(`${KEY_CACHE_PREFIX}${oldKey.keyHash}`);

    await this.audit.log({
      actorId,
      action: 'KEY_ROTATE',
      targetType: 'ApiKey',
      targetId: newKeyResult.key.id,
      details: { oldKeyId: keyId, newKeyId: newKeyResult.key.id, gracePeriodHours: GRACE_PERIOD_HOURS },
    });

    return newKeyResult;
  }

  async revokeKey(keyId: string, actorId: string): Promise<void> {
    const key = await this.prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!key) throw new NotFoundException('API key not found');
    await this.assertCanManageKey(actorId, key.userId);

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: ApiKeyStatus.REVOKED, revokedAt: new Date() },
    });

    // Invalidate cache
    await this.redis.del(`${KEY_CACHE_PREFIX}${key.keyHash}`);

    await this.audit.log({
      actorId,
      action: 'KEY_REVOKE',
      targetType: 'ApiKey',
      targetId: keyId,
      details: { userId: key.userId },
    });
  }

  async revokeAllUserKeys(userId: string, actorId: string): Promise<number> {
    const activeKeys = await this.prisma.apiKey.findMany({
      where: { userId, status: { in: [ApiKeyStatus.ACTIVE, ApiKeyStatus.ROTATING] } },
    });

    await Promise.all(activeKeys.map((key) => this.revokeKey(key.id, actorId)));
    return activeKeys.length;
  }

  async listKeys(page: number, limit: number): Promise<{ keys: KeyWithRouting[]; total: number }> {
    const [keys, total, sharedProviderKeys] = await Promise.all([
      this.prisma.apiKey.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, fullName: true } } },
      }),
      this.prisma.apiKey.count(),
      this.prisma.providerKey.findMany({
        where: { scope: ProviderKeyScope.SHARED, isActive: true },
        select: { provider: true },
      }),
    ]);

    const userIds = [...new Set(keys.map((k) => k.userId))];
    const perSeatProviderKeys = await this.prisma.providerKey.findMany({
      where: {
        userId: { in: userIds },
        scope: ProviderKeyScope.PER_SEAT,
        isActive: true,
      },
      select: { userId: true, provider: true },
    });

    const sharedSet = new Set(sharedProviderKeys.map((k) => k.provider));
    const perSeatSet = new Set(
      perSeatProviderKeys.map((k) => `${k.userId}:${k.provider}`),
    );

    const providers = [ProviderType.ANTHROPIC, ProviderType.OPENAI, ProviderType.GOOGLE];
    const keysWithRouting: KeyWithRouting[] = keys.map((key) => ({
      ...key,
      providerRouting: providers.map((provider) => {
        if (perSeatSet.has(`${key.userId}:${provider}`)) {
          return { provider, scope: ProviderKeyScope.PER_SEAT, source: 'per-seat' as const };
        }
        if (sharedSet.has(provider)) {
          return { provider, scope: ProviderKeyScope.SHARED, source: 'shared' as const };
        }
        return { provider, scope: 'NONE', source: 'unconfigured' as const };
      }),
    }));

    return { keys: keysWithRouting, total };
  }

  async getMyKey(userId: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findFirst({
      where: { userId, status: { in: [ApiKeyStatus.ACTIVE, ApiKeyStatus.ROTATING] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async claimOnboardingKey(userId: string, token: string): Promise<{ plaintext: string; keyId: string }> {
    const payload = await this.oneTimeToken.consume(token, 'key_reveal');
    if (!payload) throw new ForbiddenException('Invalid or expired claim token');
    if (payload.subject !== userId) throw new ForbiddenException('Token subject mismatch');
    if (!payload.keyPlaintext) throw new ForbiddenException('Claim token has no key payload');

    const key = await this.prisma.apiKey.findUnique({
      where: { id: payload.resourceId },
      select: { id: true, userId: true, status: true },
    });
    if (!key || key.userId !== userId || key.status === ApiKeyStatus.REVOKED) {
      throw new ForbiddenException('Claimed key is not available');
    }

    return { plaintext: payload.keyPlaintext, keyId: key.id };
  }

  hashKey(plaintext: string): string {
    return crypto.createHash('sha256').update(plaintext).digest('hex');
  }

  private async assertCanManageKey(actorId: string, keyOwnerId: string): Promise<void> {
    if (actorId === 'system' || actorId === keyOwnerId) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });

    if (!actor || (actor.role !== UserRole.IT_ADMIN && actor.role !== UserRole.SUPER_ADMIN)) {
      throw new ForbiddenException('You do not have permission to manage this key');
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async revokeExpiredRotatingKeys(): Promise<void> {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_HOURS * 60 * 60 * 1000);
    const staleKeys = await this.prisma.apiKey.findMany({
      where: {
        status: ApiKeyStatus.ROTATING,
        rotatedAt: { lte: cutoff },
      },
      select: { id: true },
      take: 500,
    });

    for (const key of staleKeys) {
      try {
        await this.revokeKey(key.id, 'system');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to revoke expired rotating key ${key.id}: ${message}`);
      }
    }
  }
}

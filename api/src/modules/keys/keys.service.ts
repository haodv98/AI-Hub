import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { ApiKey, ApiKeyStatus } from '@prisma/client';
import * as crypto from 'crypto';

const GRACE_PERIOD_HOURS = 72;
const KEY_CACHE_PREFIX = 'apikey:hash:';
const KEY_CACHE_TTL = 30; // seconds

export interface GeneratedKey {
  key: ApiKey;
  plaintext: string;
}

@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
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
    if (oldKey.status !== ApiKeyStatus.ACTIVE) {
      throw new ForbiddenException('Only ACTIVE keys can be rotated');
    }

    const newKeyResult = await this.generateKey(oldKey.userId, actorId);

    // Mark old key as ROTATING with back-reference
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: {
        status: ApiKeyStatus.ROTATING,
        rotatedFromId: keyId,
        rotatedAt: new Date(),
      },
    });

    // Invalidate old key cache
    await this.redis.del(`${KEY_CACHE_PREFIX}${oldKey.keyHash}`);

    // Schedule revoke old key after grace period
    const graceMs = GRACE_PERIOD_HOURS * 60 * 60 * 1000;
    setTimeout(async () => {
      try {
        await this.revokeKey(keyId, 'system');
      } catch {
        // Key may already be revoked
      }
    }, graceMs);

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

  async listKeys(page: number, limit: number): Promise<{ keys: ApiKey[]; total: number }> {
    const [keys, total] = await Promise.all([
      this.prisma.apiKey.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, fullName: true } } },
      }),
      this.prisma.apiKey.count(),
    ]);
    return { keys, total };
  }

  async getMyKey(userId: string): Promise<ApiKey | null> {
    return this.prisma.apiKey.findFirst({
      where: { userId, status: ApiKeyStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
  }

  hashKey(plaintext: string): string {
    return crypto.createHash('sha256').update(plaintext).digest('hex');
  }
}

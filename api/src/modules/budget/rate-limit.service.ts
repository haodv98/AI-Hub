import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const WINDOW_MS = 60 * 1000; // 1 minute sliding window

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  async checkRateLimit(userId: string, limitRpm: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const key = `ratelimit:user:${userId}:rpm`;

    try {
      // Remove entries outside the sliding window
      await this.redis.zremrangebyscore(key, '-inf', windowStart);

      // Add current request timestamp
      await this.redis.zadd(key, now, `${now}-${Math.random()}`);

      // Set TTL on the key
      await this.redis.expire(key, 65);

      // Count requests in current window
      const count = await this.redis.zcard(key);
      const remaining = Math.max(0, limitRpm - count);

      return {
        allowed: count <= limitRpm,
        remaining,
        resetAt: new Date(windowStart + WINDOW_MS),
      };
    } catch (err) {
      // Fallback: allow on Redis error, log warning
      this.logger.warn(`Rate limit check failed for user ${userId}: ${err.message} — allowing`);
      return { allowed: true, remaining: limitRpm, resetAt: new Date(now + WINDOW_MS) };
    }
  }
}

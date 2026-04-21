import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: false,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error', err.message));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async setNx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (ttlSeconds) {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }
    const result = await this.client.setnx(key, value);
    return result === 1;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async incrbyfloat(key: string, increment: number): Promise<number> {
    const result = await this.client.incrbyfloat(key, increment);
    return parseFloat(result);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  // Sorted set operations for sliding-window rate limiting
  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.client.zadd(key, score, member);
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<void> {
    await this.client.zremrangebyscore(key, min, max);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ComboStrategy } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';
import { AdapterForwardResult } from './provider-adapter.interface';
import { ProviderAdapterService } from './provider-adapter.service';

const ATTEMPT_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = 300_000;
const STICKY_TTL_SECONDS = 3_600;

export interface ProviderComboContext {
  userId: string;
  apiKeyId?: string;
  teamId?: string;
  vaultPath?: string;
}

export interface ProviderComboEntity {
  id: string;
  name: string;
  models: unknown; // Prisma Json — validated at runtime
  strategy: ComboStrategy;
  stickyLimit: number;
}

interface StickyState {
  modelIdx: number;
  usedCount: number;
}

@Injectable()
export class ProviderComboService {
  private readonly logger = new Logger(ProviderComboService.name);

  constructor(
    private readonly adapterService: ProviderAdapterService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  async executeFallback(
    combo: ProviderComboEntity,
    body: Record<string, unknown>,
    context: ProviderComboContext,
  ): Promise<AdapterForwardResult> {
    const models = this.parseModels(combo);
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    let lastError: unknown;

    for (let i = 0; i < models.length; i++) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;

      try {
        const result = await this.timedForward(models[i], body, context.vaultPath, Math.min(ATTEMPT_TIMEOUT_MS, remainingMs));
        this.metrics.recordComboAttempt(combo.name, models[i], i, 'success');
        return result;
      } catch (err: unknown) {
        this.metrics.recordComboAttempt(combo.name, models[i], i, 'error');
        lastError = err;
        const isLast = i === models.length - 1;
        if (!this.isRetryable(err) || isLast) throw err;
        this.metrics.recordComboFallback(combo.name);
        this.logger.warn(`Combo ${combo.name} attempt ${i + 1} failed, trying next model`);
      }
    }

    throw lastError ?? new Error(`Combo ${combo.name}: total timeout exceeded`);
  }

  async executeRoundRobin(
    combo: ProviderComboEntity,
    body: Record<string, unknown>,
    context: ProviderComboContext,
  ): Promise<AdapterForwardResult> {
    const models = this.parseModels(combo);
    const stickyKey = `combo:rr:${combo.id}:${context.userId}`;
    const counterKey = `combo:rr:${combo.id}:counter`;
    const stickyLimit = Math.max(combo.stickyLimit, 1);

    // 1. Resolve sticky state — if Redis is unavailable, degrade to fallback
    let state: StickyState;
    try {
      const raw = await this.redis.get(stickyKey);
      const parsed = this.parseStickyState(raw, models.length);

      if (parsed) {
        state = parsed;
      } else {
        const counter = await this.redis.incr(counterKey);
        state = { modelIdx: counter % models.length, usedCount: 0 };
      }
    } catch (err: unknown) {
      this.logger.warn(`Combo ${combo.name}: Redis unavailable, degrading to fallback — ${(err as Error).message}`);
      return this.executeFallback(combo, body, context);
    }

    // 2. Forward to selected model (provider errors propagate to caller)
    let result: AdapterForwardResult;
    try {
      result = await this.timedForward(models[state.modelIdx], body, context.vaultPath, ATTEMPT_TIMEOUT_MS);
      this.metrics.recordComboAttempt(combo.name, models[state.modelIdx], 0, 'success');
    } catch (err: unknown) {
      this.metrics.recordComboAttempt(combo.name, models[state.modelIdx], 0, 'error');
      throw err;
    }

    // 3. Advance sticky state — best-effort, never fail the response
    state.usedCount++;
    if (state.usedCount >= stickyLimit) {
      state.modelIdx = (state.modelIdx + 1) % models.length;
      state.usedCount = 0;
    }
    this.redis
      .set(stickyKey, JSON.stringify(state), STICKY_TTL_SECONDS)
      .catch((err: unknown) => this.logger.warn(`Combo ${combo.name}: failed to save sticky state — ${(err as Error).message}`));

    return result;
  }

  isRetryable(err: unknown): boolean {
    if (err instanceof HttpException) {
      const status = err.getStatus();
      return status === 429 || status >= 500;
    }
    if (err instanceof Error) {
      const code = (err as NodeJS.ErrnoException).code;
      return code === 'ETIMEDOUT' || code === 'ECONNRESET';
    }
    return false;
  }

  private parseModels(combo: ProviderComboEntity): string[] {
    if (!Array.isArray(combo.models) || combo.models.length === 0) {
      throw new Error(`Combo "${combo.name}" has no models configured`);
    }
    const strings = (combo.models as unknown[]).filter((m): m is string => typeof m === 'string');
    if (strings.length === 0) throw new Error(`Combo "${combo.name}" models must be string[]`);
    return strings;
  }

  private parseStickyState(raw: string | null, modelCount: number): StickyState | null {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as Partial<StickyState>;
      if (typeof v.modelIdx !== 'number' || typeof v.usedCount !== 'number') return null;
      if (v.modelIdx < 0 || v.usedCount < 0) return null;
      return { modelIdx: v.modelIdx % modelCount, usedCount: v.usedCount };
    } catch {
      return null;
    }
  }

  private timedForward(
    resolvedModel: string,
    body: Record<string, unknown>,
    vaultPath: string | undefined,
    timeoutMs: number,
  ): Promise<AdapterForwardResult> {
    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => {
        const err = Object.assign(new Error(`Forward timeout after ${timeoutMs}ms`), { code: 'ETIMEDOUT' });
        reject(err);
      }, timeoutMs);
      t.unref?.();
    });
    return Promise.race([this.adapterService.forward(resolvedModel, body, vaultPath), timeout]);
  }
}

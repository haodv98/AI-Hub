import {
  Injectable,
  Logger,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { ProviderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VaultService } from '../../vault/vault.service';
import { BudgetService } from '../budget/budget.service';
import { RateLimitService } from '../budget/rate-limit.service';
import { PricingService } from '../budget/pricing.service';
import { PoliciesService } from '../policies/policies.service';
import { UsageService } from '../usage/usage.service';
import { MetricsService } from '../metrics/metrics.service';

export interface UserContext {
  id: string;
  email: string;
  apiKeyId: string;
  teamId: string | null;
  tier: string;
}

export interface GatewayResult {
  data: unknown;
  headers: Record<string, string>;
}

type SupportedProvider = 'anthropic' | 'openai' | 'google';

interface ResolvedProviderKey {
  key: string;
  scope: 'PER_SEAT' | 'SHARED';
}

const PROVIDER_ENUM_MAP: Record<SupportedProvider, ProviderType> = {
  anthropic: ProviderType.ANTHROPIC,
  openai: ProviderType.OPENAI,
  google: ProviderType.GOOGLE,
};

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly budget: BudgetService,
    private readonly rateLimit: RateLimitService,
    private readonly pricing: PricingService,
    private readonly config: ConfigService,
    private readonly policies: PoliciesService,
    private readonly usage: UsageService,
    private readonly metrics: MetricsService,
  ) {}

  async handleRequest(user: UserContext, body: Record<string, unknown>): Promise<GatewayResult> {
    const requestStart = Date.now();
    const requestedModel = body.model as string;
    const requestedProvider = this.getProvider(requestedModel);

    // ── Step 1: Auth validated by ApiKeyGuard ─────────────────────────────

    // ── Step 2: Resolve effective policy (Redis-cached 5min) ─────────────
    const policy = await this.policies.resolveEffectivePolicy(user.id);

    // ── Step 3: Check model access ────────────────────────────────────────
    if (policy.allowedEngines.length > 0 && !policy.allowedEngines.includes(requestedModel)) {
      throw new ForbiddenException(`Model '${requestedModel}' is not allowed by your policy`);
    }

    // ── Step 4: Rate limit check ──────────────────────────────────────────
    const rpm = policy.config.limits.rpm;
    const rateLimitResult = await this.rateLimit.checkRateLimit(user.id, rpm);
    if (!rateLimitResult.allowed) {
      this.metrics.recordRateLimitRejection(user.tier);
      this.metrics.recordGatewayRequest(requestedProvider, requestedModel, 'error');
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // ── Step 5: Budget check + smart fallback ─────────────────────────────
    const budgetResult = await this.budget.checkAndEnforceBudget(
      user.id,
      user.teamId,
      requestedModel,
      {
        monthlyBudgetUsd: policy.config.limits.monthlyBudgetUsd,
        fallback: policy.config.fallback,
      },
    );

    if (!budgetResult.allowed) {
      throw new HttpException(
        { success: false, error: { code: 'BUDGET_EXCEEDED', message: 'Monthly budget limit reached' } },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const actualModel = budgetResult.fallbackModel || requestedModel;
    const isFallback = !!budgetResult.fallbackModel;
    const provider = this.getProvider(actualModel);

    // ── Step 6: Resolve provider key — per-seat or shared ────────────────
    const resolved = await this.resolveProviderKey(user.id, provider as SupportedProvider);

    // ── Step 7: Forward to LiteLLM ───────────────────────────────────────
    const litellmUrl = this.config.get('LITELLM_URL', 'http://localhost:4000');
    const litellmKey = this.config.get('LITELLM_MASTER_KEY', '');

    const requestBody: Record<string, unknown> = {
      ...body,
      model: actualModel,
      // Per-seat: inject personal key so LiteLLM uses it for the upstream call.
      // Shared: omit — LiteLLM uses its configured credentials.
      ...(resolved.scope === 'PER_SEAT' ? { api_key: resolved.key } : {}),
      metadata: {
        ...((body.metadata as Record<string, unknown>) ?? {}),
        userId: user.id,
        teamId: user.teamId,
        apiKeyId: user.apiKeyId,
      },
    };

    let providerResponse: AxiosResponse;
    try {
      providerResponse = await axios.post(`${litellmUrl}/v1/chat/completions`, requestBody, {
        headers: {
          Authorization: `Bearer ${litellmKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 300_000,
        responseType: body.stream ? 'stream' : 'json',
      });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
      const status = axiosErr.response?.status ?? 502;
      const message = axiosErr.response?.data?.error?.message ?? 'Provider error';
      this.metrics.recordGatewayRequest(provider, actualModel, 'error');
      this.metrics.observeGatewayLatency(provider, Date.now() - requestStart);
      throw new HttpException({ success: false, error: { code: 'PROVIDER_ERROR', message } }, status);
    }

    // ── Step 8: Record usage via UsageService (single source of truth) ────
    // UsageService handles: TimescaleDB write, budget counter, key.lastUsedAt, alert checks
    const responseData = providerResponse.data as Record<string, unknown>;
    const usage = responseData?.usage as Record<string, number> | undefined;
    if (usage) {
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const costUsd = this.pricing.estimateCost(actualModel, promptTokens, completionTokens);

      this.usage.recordEvent({
        userId: user.id,
        teamId: user.teamId,
        apiKeyId: user.apiKeyId,
        model: actualModel,
        provider,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costUsd,
        latencyMs: Date.now() - requestStart,
      });
    }
    this.metrics.recordGatewayRequest(provider, actualModel, 'success');
    this.metrics.observeGatewayLatency(provider, Date.now() - requestStart);

    // ── Step 9: Return with enriched headers ──────────────────────────────
    return {
      data: providerResponse.data,
      headers: {
        'X-AIHub-Model': actualModel,
        'X-AIHub-Fallback': String(isFallback),
        'X-AIHub-RateLimit-Remaining': String(rateLimitResult.remaining),
        'X-AIHub-Budget-Pct': String(Math.round(budgetResult.usagePct)),
        'X-AIHub-Key-Scope': resolved.scope,
      },
    };
  }

  private getProvider(model: string): SupportedProvider {
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gpt') || model.includes('o1') || model.includes('o3')) return 'openai';
    if (model.includes('gemini')) return 'google';
    return 'anthropic';
  }

  private async resolveProviderKey(userId: string, provider: SupportedProvider): Promise<ResolvedProviderKey> {
    const perSeatRecord = await this.prisma.providerKey.findFirst({
      where: {
        userId,
        provider: PROVIDER_ENUM_MAP[provider],
        scope: 'PER_SEAT',
        isActive: true,
      },
      select: { vaultPath: true },
    });

    if (perSeatRecord) {
      const key = await this.vault.readSecret(perSeatRecord.vaultPath, 'api_key');
      return { key, scope: 'PER_SEAT' };
    }

    const key = await this.vault.getProviderKey(provider);
    return { key, scope: 'SHARED' };
  }
}

import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ComboStrategy, ProviderType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetService } from '../budget/budget.service';
import { RateLimitService } from '../budget/rate-limit.service';
import { PricingService } from '../budget/pricing.service';
import { PoliciesService } from '../policies/policies.service';
import { UsageService } from '../usage/usage.service';
import { MetricsService } from '../metrics/metrics.service';
import { ModelRouterService } from '../model-router/model-router.service';
import { ProviderAdapterService } from '../provider-adapter/provider-adapter.service';
import { ProviderComboService, ProviderComboContext } from '../provider-adapter/provider-combo.service';

export interface UserContext {
  id: string;
  email: string;
  apiKeyId: string;
  teamId: string | null;
  tier: string;
  defaultUpstreamModel?: string | null;
}

export interface GatewayResult {
  data: unknown;
  headers: Record<string, string>;
  stream?: NodeJS.ReadableStream;
}

const ALIAS_TO_PROVIDER_TYPE: Partial<Record<string, ProviderType>> = {
  anthropic: ProviderType.ANTHROPIC,
  openai: ProviderType.OPENAI,
  google: ProviderType.GOOGLE,
  gemini: ProviderType.GOOGLE,
};

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: BudgetService,
    private readonly rateLimit: RateLimitService,
    private readonly pricing: PricingService,
    private readonly policies: PoliciesService,
    private readonly usage: UsageService,
    private readonly metrics: MetricsService,
    private readonly modelRouter: ModelRouterService,
    private readonly adapterService: ProviderAdapterService,
    private readonly comboService: ProviderComboService,
  ) {}

  async handleRequest(user: UserContext, body: Record<string, unknown>): Promise<GatewayResult> {
    const requestStart = Date.now();
    const keyOverride =
      typeof user.defaultUpstreamModel === 'string' && user.defaultUpstreamModel.trim().length > 0
        ? user.defaultUpstreamModel.trim()
        : null;
    const clientModel = typeof body.model === 'string' ? body.model : '';
    const requestedModel = keyOverride ?? clientModel;
    if (!requestedModel) {
      throw new BadRequestException('Missing model (set on API key or in request body)');
    }

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
      this.metrics.recordGatewayRequest('unknown', requestedModel, 'error');
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

    const baseModel = budgetResult.fallbackModel || requestedModel;
    const isFallback = !!budgetResult.fallbackModel;

    // ── Step 6: Resolve alias → forward via provider adapter ──────────────
    const resolved = await this.modelRouter.resolveAlias(baseModel, {
      apiKeyId: user.apiKeyId,
      teamId: user.teamId ?? undefined,
      userId: user.id,
    });

    const provider = this.extractProviderAlias(resolved.providerModel);
    const vaultPath = await this.resolvePerSeatVaultPath(user.id, provider);

    const context: ProviderComboContext = {
      userId: user.id,
      apiKeyId: user.apiKeyId,
      teamId: user.teamId ?? undefined,
      vaultPath,
    };

    let adapterResult: { data: unknown; headers: Record<string, string>; stream?: NodeJS.ReadableStream };
    try {
      if (resolved.comboName) {
        const combo = await this.prisma.providerCombo.findUnique({ where: { name: resolved.comboName } });
        if (!combo) throw new HttpException(`Combo '${resolved.comboName}' not found`, HttpStatus.BAD_GATEWAY);
        adapterResult =
          combo.strategy === ComboStrategy.ROUND_ROBIN
            ? await this.comboService.executeRoundRobin(combo, body, context)
            : await this.comboService.executeFallback(combo, body, context);
      } else {
        adapterResult = await this.adapterService.forward(resolved.providerModel, body, vaultPath);
      }
    } catch (err: unknown) {
      this.metrics.recordGatewayRequest(provider, resolved.providerModel, 'error');
      this.metrics.observeGatewayLatency(provider, Date.now() - requestStart);
      if (err instanceof HttpException) throw err;
      throw new HttpException('Provider error', HttpStatus.BAD_GATEWAY);
    }

    // ── Step 7: Record usage (non-streaming only — streaming has no token count upfront) ──
    if (!body.stream) {
      const responseData = adapterResult.data as Record<string, unknown> | undefined;
      const usageData = responseData?.usage as Record<string, number> | undefined;
      if (usageData) {
        const promptTokens = usageData.prompt_tokens ?? 0;
        const completionTokens = usageData.completion_tokens ?? 0;
        const costUsd = this.pricing.estimateCost(resolved.providerModel, promptTokens, completionTokens);
        this.usage.recordEvent({
          userId: user.id,
          teamId: user.teamId,
          apiKeyId: user.apiKeyId,
          model: resolved.providerModel,
          provider,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          costUsd,
          latencyMs: Date.now() - requestStart,
        });
      }
    }

    this.metrics.recordGatewayRequest(provider, resolved.providerModel, 'success');
    this.metrics.observeGatewayLatency(provider, Date.now() - requestStart);

    // ── Step 8: Return with enriched headers ──────────────────────────────
    return {
      data: adapterResult.data,
      stream: adapterResult.stream,
      headers: {
        ...adapterResult.headers,
        'X-AIHub-Model': resolved.providerModel,
        'X-AIHub-Fallback': String(isFallback),
        'X-AIHub-RateLimit-Remaining': String(rateLimitResult.remaining),
        'X-AIHub-Budget-Pct': String(Math.round(budgetResult.usagePct)),
      },
    };
  }

  private extractProviderAlias(providerModel: string): string {
    const slashIdx = providerModel.indexOf('/');
    if (slashIdx !== -1) return providerModel.slice(0, slashIdx);
    if (providerModel.includes('claude')) return 'anthropic';
    if (providerModel.includes('gpt') || providerModel.includes('o1') || providerModel.includes('o3')) return 'openai';
    if (providerModel.includes('gemini')) return 'google';
    return 'other';
  }

  private async resolvePerSeatVaultPath(userId: string, providerAlias: string): Promise<string | undefined> {
    const providerType = ALIAS_TO_PROVIDER_TYPE[providerAlias];
    if (!providerType) return undefined;

    const record = await this.prisma.providerKey.findFirst({
      where: { userId, provider: providerType, scope: 'PER_SEAT', isActive: true },
      select: { vaultPath: true },
    });
    return record?.vaultPath ?? undefined;
  }
}

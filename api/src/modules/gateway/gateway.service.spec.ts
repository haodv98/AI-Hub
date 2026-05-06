import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { ComboStrategy, ProviderType } from '@prisma/client';
import { GatewayService, UserContext } from './gateway.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetService } from '../budget/budget.service';
import { RateLimitService } from '../budget/rate-limit.service';
import { PricingService } from '../budget/pricing.service';
import { PoliciesService } from '../policies/policies.service';
import { UsageService } from '../usage/usage.service';
import { MetricsService } from '../metrics/metrics.service';
import { ModelRouterService } from '../model-router/model-router.service';
import { ProviderAdapterService } from '../provider-adapter/provider-adapter.service';
import { ProviderComboService } from '../provider-adapter/provider-combo.service';

const PROVIDER_MODEL = 'anthropic/claude-haiku-4';
const FALLBACK_MODEL = 'anthropic/claude-haiku-4-5';

const mockAdapterResult = () => ({
  data: {
    choices: [{ message: { role: 'assistant', content: 'Hello' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    model: PROVIDER_MODEL,
  },
  headers: { 'x-provider': 'anthropic' },
});

const mockPrisma = () => ({
  providerKey: { findFirst: jest.fn().mockResolvedValue(null) },
  providerCombo: { findUnique: jest.fn() },
});

const mockBudget = () => ({
  checkAndEnforceBudget: jest.fn().mockResolvedValue({
    allowed: true, currentCostUsd: 10, budgetCapUsd: 100, usagePct: 10,
  }),
});

const mockRateLimit = () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 50, resetAt: new Date() }),
});

const mockPricing = () => ({ estimateCost: jest.fn().mockReturnValue(0.002) });

const mockPolicies = () => ({
  resolveEffectivePolicy: jest.fn().mockResolvedValue({
    allowedEngines: [],
    config: { limits: { rpm: 60, monthlyBudgetUsd: 100 }, fallback: null },
  }),
});

const mockUsage = () => ({ recordEvent: jest.fn() });

const mockMetrics = () => ({
  recordGatewayRequest: jest.fn(),
  observeGatewayLatency: jest.fn(),
  recordRateLimitRejection: jest.fn(),
});

const mockModelRouter = () => ({
  resolveAlias: jest.fn().mockResolvedValue({
    providerModel: PROVIDER_MODEL,
    isPassthrough: false,
    comboName: undefined,
  }),
});

const mockAdapterService = () => ({
  forward: jest.fn().mockResolvedValue(mockAdapterResult()),
});

const mockComboService = () => ({
  executeFallback: jest.fn().mockResolvedValue(mockAdapterResult()),
  executeRoundRobin: jest.fn().mockResolvedValue(mockAdapterResult()),
});

const testUser: UserContext = {
  id: 'u1', email: 'dev@company.com', apiKeyId: 'k1', teamId: 't1', tier: 'MEMBER',
};

describe('GatewayService', () => {
  let service: GatewayService;
  let budget: ReturnType<typeof mockBudget>;
  let rateLimit: ReturnType<typeof mockRateLimit>;
  let policies: ReturnType<typeof mockPolicies>;
  let usage: ReturnType<typeof mockUsage>;
  let prisma: ReturnType<typeof mockPrisma>;
  let modelRouter: ReturnType<typeof mockModelRouter>;
  let adapterService: ReturnType<typeof mockAdapterService>;
  let comboService: ReturnType<typeof mockComboService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: BudgetService, useFactory: mockBudget },
        { provide: RateLimitService, useFactory: mockRateLimit },
        { provide: PricingService, useFactory: mockPricing },
        { provide: PoliciesService, useFactory: mockPolicies },
        { provide: UsageService, useFactory: mockUsage },
        { provide: MetricsService, useFactory: mockMetrics },
        { provide: ModelRouterService, useFactory: mockModelRouter },
        { provide: ProviderAdapterService, useFactory: mockAdapterService },
        { provide: ProviderComboService, useFactory: mockComboService },
      ],
    }).compile();

    service = module.get(GatewayService);
    budget = module.get(BudgetService) as ReturnType<typeof mockBudget>;
    rateLimit = module.get(RateLimitService) as ReturnType<typeof mockRateLimit>;
    policies = module.get(PoliciesService) as ReturnType<typeof mockPolicies>;
    usage = module.get(UsageService) as ReturnType<typeof mockUsage>;
    prisma = module.get(PrismaService) as ReturnType<typeof mockPrisma>;
    modelRouter = module.get(ModelRouterService) as ReturnType<typeof mockModelRouter>;
    adapterService = module.get(ProviderAdapterService) as ReturnType<typeof mockAdapterService>;
    comboService = module.get(ProviderComboService) as ReturnType<typeof mockComboService>;
  });

  afterEach(() => jest.clearAllMocks());

  // ── Success path ──────────────────────────────────────────────────────────

  describe('handleRequest — success path', () => {
    it('returns provider response with enriched headers', async () => {
      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.data).toEqual(mockAdapterResult().data);
      expect(result.headers['X-AIHub-Model']).toBe(PROVIDER_MODEL);
      expect(result.headers['X-AIHub-Fallback']).toBe('false');
    });

    it('resolves effective policy for the user', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(policies.resolveEffectivePolicy).toHaveBeenCalledWith('u1');
    });

    it('delegates to ProviderAdapterService when no combo', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(adapterService.forward).toHaveBeenCalledWith(
        PROVIDER_MODEL,
        expect.objectContaining({ model: 'claude-haiku-4' }),
        undefined,
      );
    });

    it('records usage event after successful response', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(usage.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1', teamId: 't1', apiKeyId: 'k1',
          model: PROVIDER_MODEL, provider: 'anthropic',
          promptTokens: 100, completionTokens: 50, totalTokens: 150,
        }),
      );
    });

    it('does not record usage when response has no usage field', async () => {
      adapterService.forward.mockResolvedValue({ data: { choices: [] }, headers: {} });
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(usage.recordEvent).not.toHaveBeenCalled();
    });

    it('does not record usage for streaming requests', async () => {
      adapterService.forward.mockResolvedValue({ data: undefined, headers: {}, stream: {} as NodeJS.ReadableStream });
      await service.handleRequest(testUser, { model: 'claude-haiku-4', stream: true });
      expect(usage.recordEvent).not.toHaveBeenCalled();
    });

    it('merges adapter headers into response headers', async () => {
      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.headers['x-provider']).toBe('anthropic');
    });
  });

  // ── Model access check ────────────────────────────────────────────────────

  describe('handleRequest — model access', () => {
    it('throws ForbiddenException when model not in allowedEngines', async () => {
      policies.resolveEffectivePolicy.mockResolvedValue({
        allowedEngines: ['claude-haiku-4'],
        config: { limits: { rpm: 60, monthlyBudgetUsd: 100 }, fallback: null },
      });
      await expect(service.handleRequest(testUser, { model: 'gpt-4o' })).rejects.toThrow(ForbiddenException);
    });

    it('allows any model when allowedEngines is empty', async () => {
      await expect(service.handleRequest(testUser, { model: 'gpt-4o' })).resolves.toBeDefined();
    });
  });

  // ── Rate limit ────────────────────────────────────────────────────────────

  describe('handleRequest — rate limit', () => {
    it('throws 429 when rate limit exceeded', async () => {
      rateLimit.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
      await expect(service.handleRequest(testUser, { model: 'claude-haiku-4' })).rejects.toThrow(
        new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS),
      );
    });

    it('includes remaining count in response headers', async () => {
      rateLimit.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 42, resetAt: new Date() });
      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.headers['X-AIHub-RateLimit-Remaining']).toBe('42');
    });
  });

  // ── Budget enforcement ────────────────────────────────────────────────────

  describe('handleRequest — budget', () => {
    it('throws 402 when budget exceeded', async () => {
      budget.checkAndEnforceBudget.mockResolvedValue({ allowed: false, currentCostUsd: 100, budgetCapUsd: 100, usagePct: 100 });
      try {
        await service.handleRequest(testUser, { model: 'claude-haiku-4' });
        fail('expected to throw');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      }
    });

    it('uses fallback model when budget fallback is applied', async () => {
      budget.checkAndEnforceBudget.mockResolvedValue({ allowed: true, currentCostUsd: 95, budgetCapUsd: 100, usagePct: 95, fallbackModel: FALLBACK_MODEL });
      modelRouter.resolveAlias.mockResolvedValue({ providerModel: FALLBACK_MODEL, isPassthrough: false });
      const result = await service.handleRequest(testUser, { model: 'claude-opus-4' });
      expect(result.headers['X-AIHub-Model']).toBe(FALLBACK_MODEL);
      expect(result.headers['X-AIHub-Fallback']).toBe('true');
    });

    it('includes budget percentage in response headers', async () => {
      budget.checkAndEnforceBudget.mockResolvedValue({ allowed: true, currentCostUsd: 75, budgetCapUsd: 100, usagePct: 75 });
      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.headers['X-AIHub-Budget-Pct']).toBe('75');
    });
  });

  // ── Provider error handling ───────────────────────────────────────────────

  describe('handleRequest — provider errors', () => {
    it('wraps unknown error as 502', async () => {
      adapterService.forward.mockRejectedValue(new Error('ECONNREFUSED'));
      try {
        await service.handleRequest(testUser, { model: 'claude-haiku-4' });
        fail('expected to throw');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(502);
      }
    });

    it('re-throws HttpException from adapter as-is', async () => {
      adapterService.forward.mockRejectedValue(new HttpException('Rate limited upstream', 429));
      try {
        await service.handleRequest(testUser, { model: 'claude-haiku-4' });
        fail('expected to throw');
      } catch (err: unknown) {
        expect((err as HttpException).getStatus()).toBe(429);
      }
    });
  });

  // ── Per-seat vault path resolution ───────────────────────────────────────

  describe('handleRequest — per-seat vault path', () => {
    const perSeatRecord = { vaultPath: 'kv/aihub/providers/anthropic/users/u1' };

    it('queries DB for per-seat key using provider + user filters', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(prisma.providerKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', provider: ProviderType.ANTHROPIC, scope: 'PER_SEAT', isActive: true }),
        }),
      );
    });

    it('passes per-seat vaultPath to adapter when found', async () => {
      prisma.providerKey.findFirst.mockResolvedValue(perSeatRecord);
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(adapterService.forward).toHaveBeenCalledWith(
        PROVIDER_MODEL,
        expect.anything(),
        'kv/aihub/providers/anthropic/users/u1',
      );
    });

    it('passes undefined vaultPath when no per-seat key assigned', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(adapterService.forward).toHaveBeenCalledWith(PROVIDER_MODEL, expect.anything(), undefined);
    });
  });

  // ── Combo routing ─────────────────────────────────────────────────────────

  describe('handleRequest — combo routing', () => {
    const combo = {
      id: 'combo-1', name: 'my-combo', models: ['openai/gpt-4o', 'anthropic/claude-haiku-4'],
      strategy: ComboStrategy.FALLBACK, stickyLimit: 10, scope: 'ORG', isActive: true,
      createdAt: new Date(), updatedAt: new Date(), scopeId: null,
    };

    beforeEach(() => {
      modelRouter.resolveAlias.mockResolvedValue({ providerModel: 'openai/gpt-4o', isPassthrough: false, comboName: 'my-combo' });
      prisma.providerCombo.findUnique.mockResolvedValue(combo);
    });

    it('calls executeFallback for FALLBACK strategy', async () => {
      await service.handleRequest(testUser, { model: 'my-combo' });
      expect(comboService.executeFallback).toHaveBeenCalledWith(combo, expect.anything(), expect.anything());
      expect(adapterService.forward).not.toHaveBeenCalled();
    });

    it('calls executeRoundRobin for ROUND_ROBIN strategy', async () => {
      prisma.providerCombo.findUnique.mockResolvedValue({ ...combo, strategy: ComboStrategy.ROUND_ROBIN });
      await service.handleRequest(testUser, { model: 'my-combo' });
      expect(comboService.executeRoundRobin).toHaveBeenCalled();
    });

    it('throws 502 when combo name not found in DB', async () => {
      prisma.providerCombo.findUnique.mockResolvedValue(null);
      try {
        await service.handleRequest(testUser, { model: 'my-combo' });
        fail('expected to throw');
      } catch (err: unknown) {
        expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
    });
  });

  // ── Model + provider alias mapping ────────────────────────────────────────

  describe('handleRequest — provider alias extraction', () => {
    const cases = [
      ['openai/gpt-4o', 'openai'],
      ['anthropic/claude-haiku-4', 'anthropic'],
      ['gemini/gemini-2.0-flash', 'gemini'],
      ['claude-haiku-4-5', 'anthropic'],
      ['gpt-4o', 'openai'],
    ] as const;

    test.each(cases)('model %s → alias %s', async (model, expectedAlias) => {
      modelRouter.resolveAlias.mockResolvedValue({ providerModel: model, isPassthrough: false });
      await service.handleRequest(testUser, { model });
      expect(prisma.providerKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
      );
      // Verify the provider alias resolves to the right ProviderType (or undefined for unknown)
      const call = (prisma.providerKey.findFirst as jest.Mock).mock.calls[0][0];
      if (expectedAlias === 'openai') expect(call.where.provider).toBe(ProviderType.OPENAI);
      if (expectedAlias === 'anthropic') expect(call.where.provider).toBe(ProviderType.ANTHROPIC);
    });
  });

  // ── defaultUpstreamModel override ────────────────────────────────────────

  describe('defaultUpstreamModel (API key override)', () => {
    it('uses override model for routing instead of client model', async () => {
      const u: UserContext = { ...testUser, defaultUpstreamModel: 'openai/gpt-4o' };
      modelRouter.resolveAlias.mockResolvedValue({ providerModel: 'openai/gpt-4o', isPassthrough: false });
      await service.handleRequest(u, { model: 'claude-sonnet-4', messages: [] });
      expect(modelRouter.resolveAlias).toHaveBeenCalledWith('openai/gpt-4o', expect.anything());
    });

    it('throws BadRequestException when model missing and no override', async () => {
      await expect(service.handleRequest(testUser, { messages: [] })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayService, UserContext } from './gateway.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VaultService } from '../../vault/vault.service';
import { BudgetService } from '../budget/budget.service';
import { RateLimitService } from '../budget/rate-limit.service';
import { PricingService } from '../budget/pricing.service';
import { PoliciesService } from '../policies/policies.service';
import { UsageService } from '../usage/usage.service';
import { MetricsService } from '../metrics/metrics.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockPrisma = () => ({
  providerKey: {
    findFirst: jest.fn().mockResolvedValue(null), // default: no per-seat key assigned
  },
});

const mockVault = () => ({
  getProviderKey: jest.fn().mockResolvedValue('vault-shared-key'),
  readSecret: jest.fn().mockResolvedValue('vault-per-seat-key'),
});

const mockBudget = () => ({
  checkAndEnforceBudget: jest.fn().mockResolvedValue({
    allowed: true,
    currentCostUsd: 10,
    budgetCapUsd: 100,
    usagePct: 10,
  }),
});

const mockRateLimit = () => ({
  checkRateLimit: jest.fn().mockResolvedValue({
    allowed: true,
    remaining: 50,
    resetAt: new Date(),
  }),
});

const mockPricing = () => ({
  estimateCost: jest.fn().mockReturnValue(0.002),
});

const mockConfig = () => ({
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'LITELLM_URL') return 'http://litellm:4000';
    if (key === 'LITELLM_MASTER_KEY') return 'master-key';
    return undefined;
  }),
});

const mockPolicies = () => ({
  resolveEffectivePolicy: jest.fn().mockResolvedValue({
    allowedEngines: [],
    config: {
      limits: { rpm: 60, monthlyBudgetUsd: 100 },
      fallback: null,
    },
  }),
});

const mockUsage = () => ({
  recordEvent: jest.fn(),
});

const mockMetrics = () => ({
  recordGatewayRequest: jest.fn(),
  observeGatewayLatency: jest.fn(),
  recordRateLimitRejection: jest.fn(),
});

const testUser: UserContext = {
  id: 'u1',
  email: 'dev@company.com',
  apiKeyId: 'k1',
  teamId: 't1',
  tier: 'MEMBER',
};

const successResponse = {
  data: {
    choices: [{ message: { content: 'Hello' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    model: 'claude-haiku-4',
  },
  status: 200,
  headers: {},
};

describe('GatewayService', () => {
  let service: GatewayService;
  let budget: ReturnType<typeof mockBudget>;
  let rateLimit: ReturnType<typeof mockRateLimit>;
  let policies: ReturnType<typeof mockPolicies>;
  let usage: ReturnType<typeof mockUsage>;
  let vault: ReturnType<typeof mockVault>;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: VaultService, useFactory: mockVault },
        { provide: BudgetService, useFactory: mockBudget },
        { provide: RateLimitService, useFactory: mockRateLimit },
        { provide: PricingService, useFactory: mockPricing },
        { provide: ConfigService, useFactory: mockConfig },
        { provide: PoliciesService, useFactory: mockPolicies },
        { provide: UsageService, useFactory: mockUsage },
        { provide: MetricsService, useFactory: mockMetrics },
      ],
    }).compile();

    service = module.get(GatewayService);
    budget = module.get(BudgetService) as any;
    rateLimit = module.get(RateLimitService) as any;
    policies = module.get(PoliciesService) as any;
    usage = module.get(UsageService) as any;
    vault = module.get(VaultService) as any;
    prisma = module.get(PrismaService) as any;

    (mockedAxios.post as jest.Mock).mockResolvedValue(successResponse);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Successful path ───────────────────────────────────────────────────────

  describe('handleRequest — success path', () => {
    it('returns provider response with enriched headers', async () => {
      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.data).toEqual(successResponse.data);
      expect(result.headers['X-AIHub-Model']).toBe('claude-haiku-4');
      expect(result.headers['X-AIHub-Fallback']).toBe('false');
    });

    it('resolves effective policy for the user', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(policies.resolveEffectivePolicy).toHaveBeenCalledWith('u1');
    });

    it('uses shared provider key when no per-seat key assigned', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(vault.getProviderKey).toHaveBeenCalledWith('anthropic');
      expect(vault.readSecret).not.toHaveBeenCalled();
    });

    it('returns SHARED scope in response headers by default', async () => {
      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.headers['X-AIHub-Key-Scope']).toBe('SHARED');
    });

    it('forwards request to LiteLLM', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://litellm:4000/v1/chat/completions',
        expect.objectContaining({ model: 'claude-haiku-4' }),
        expect.any(Object),
      );
    });

    it('injects user metadata into request body', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      const requestBody = (mockedAxios.post as jest.Mock).mock.calls[0][1];
      expect(requestBody.metadata).toMatchObject({ userId: 'u1', teamId: 't1', apiKeyId: 'k1' });
    });

    it('records usage event asynchronously', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(usage.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          teamId: 't1',
          apiKeyId: 'k1',
          model: 'claude-haiku-4',
          provider: 'anthropic',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        }),
      );
    });

    it('does not record usage when response has no usage field', async () => {
      (mockedAxios.post as jest.Mock).mockResolvedValue({
        ...successResponse,
        data: { choices: [{ message: { content: 'ok' } }] }, // no usage
      });
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(usage.recordEvent).not.toHaveBeenCalled();
    });
  });

  // ── Model access check ────────────────────────────────────────────────────

  describe('handleRequest — model access', () => {
    it('throws ForbiddenException when model not in allowedEngines', async () => {
      (policies.resolveEffectivePolicy as jest.Mock).mockResolvedValue({
        allowedEngines: ['claude-haiku-4'],
        config: { limits: { rpm: 60, monthlyBudgetUsd: 100 }, fallback: null },
      });

      await expect(
        service.handleRequest(testUser, { model: 'gpt-4o' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows any model when allowedEngines is empty', async () => {
      (policies.resolveEffectivePolicy as jest.Mock).mockResolvedValue({
        allowedEngines: [],
        config: { limits: { rpm: 60, monthlyBudgetUsd: 100 }, fallback: null },
      });

      await expect(
        service.handleRequest(testUser, { model: 'gpt-4o' }),
      ).resolves.toBeDefined();
    });
  });

  // ── Rate limit ────────────────────────────────────────────────────────────

  describe('handleRequest — rate limit', () => {
    it('throws 429 when rate limit exceeded', async () => {
      (rateLimit.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date(),
      });

      await expect(
        service.handleRequest(testUser, { model: 'claude-haiku-4' }),
      ).rejects.toThrow(new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS));
    });

    it('includes remaining count in response headers', async () => {
      (rateLimit.checkRateLimit as jest.Mock).mockResolvedValue({
        allowed: true,
        remaining: 42,
        resetAt: new Date(),
      });

      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.headers['X-AIHub-RateLimit-Remaining']).toBe('42');
    });
  });

  // ── Budget enforcement ────────────────────────────────────────────────────

  describe('handleRequest — budget', () => {
    it('throws 402 when budget exceeded', async () => {
      (budget.checkAndEnforceBudget as jest.Mock).mockResolvedValue({
        allowed: false,
        currentCostUsd: 100,
        budgetCapUsd: 100,
        usagePct: 100,
      });

      try {
        await service.handleRequest(testUser, { model: 'claude-haiku-4' });
        fail('expected to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      }
    });

    it('uses fallback model when budget fallback is applied', async () => {
      (budget.checkAndEnforceBudget as jest.Mock).mockResolvedValue({
        allowed: true,
        currentCostUsd: 95,
        budgetCapUsd: 100,
        usagePct: 95,
        fallbackModel: 'claude-haiku-4',
      });

      const result = await service.handleRequest(testUser, { model: 'claude-opus-4' });
      expect(result.headers['X-AIHub-Model']).toBe('claude-haiku-4');
      expect(result.headers['X-AIHub-Fallback']).toBe('true');
    });

    it('includes budget percentage in response headers', async () => {
      (budget.checkAndEnforceBudget as jest.Mock).mockResolvedValue({
        allowed: true,
        currentCostUsd: 75,
        budgetCapUsd: 100,
        usagePct: 75,
      });

      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.headers['X-AIHub-Budget-Pct']).toBe('75');
    });
  });

  // ── Provider error handling ───────────────────────────────────────────────

  describe('handleRequest — provider errors', () => {
    it('throws 502 on LiteLLM connection error', async () => {
      (mockedAxios.post as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await service.handleRequest(testUser, { model: 'claude-haiku-4' });
        fail('expected to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(502);
      }
    });

    it('propagates provider status code', async () => {
      const providerErr = {
        response: {
          status: 503,
          data: { error: { message: 'Service overloaded' } },
        },
      };
      (mockedAxios.post as jest.Mock).mockRejectedValue(providerErr);

      try {
        await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      } catch (err: any) {
        expect(err.getStatus()).toBe(503);
      }
    });
  });

  // ── Provider key routing (per-seat vs shared) ─────────────────────────────

  describe('handleRequest — provider key routing', () => {
    const perSeatRecord = { vaultPath: 'kv/aihub/providers/anthropic/users/u1' };

    it('reads per-seat key from Vault when user has one assigned', async () => {
      (prisma.providerKey.findFirst as jest.Mock).mockResolvedValue(perSeatRecord);
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(vault.readSecret).toHaveBeenCalledWith(
        'kv/aihub/providers/anthropic/users/u1',
        'api_key',
      );
      expect(vault.getProviderKey).not.toHaveBeenCalled();
    });

    it('injects per-seat key as api_key in LiteLLM request body', async () => {
      (prisma.providerKey.findFirst as jest.Mock).mockResolvedValue(perSeatRecord);
      (vault.readSecret as jest.Mock).mockResolvedValue('sk-ant-per-seat-key');
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      const reqBody = (mockedAxios.post as jest.Mock).mock.calls[0][1];
      expect(reqBody.api_key).toBe('sk-ant-per-seat-key');
    });

    it('does not include api_key in LiteLLM body for shared key', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      const reqBody = (mockedAxios.post as jest.Mock).mock.calls[0][1];
      expect(reqBody.api_key).toBeUndefined();
    });

    it('returns PER_SEAT scope in response headers', async () => {
      (prisma.providerKey.findFirst as jest.Mock).mockResolvedValue(perSeatRecord);
      const result = await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(result.headers['X-AIHub-Key-Scope']).toBe('PER_SEAT');
    });

    it('queries DB with correct user + provider + scope filters', async () => {
      await service.handleRequest(testUser, { model: 'claude-haiku-4' });
      expect(prisma.providerKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            scope: 'PER_SEAT',
            isActive: true,
          }),
        }),
      );
    });
  });

  // ── Provider detection ────────────────────────────────────────────────────

  describe('getProvider (via handleRequest model injection)', () => {
    const cases = [
      ['claude-haiku-4-5', 'anthropic'],
      ['gpt-4o', 'openai'],
      ['o3-mini', 'openai'],
      ['gemini-2.5-pro', 'google'],
    ] as const;

    test.each(cases)('model %s → provider %s', async (model, expectedProvider) => {
      await service.handleRequest(testUser, { model });
      expect(vault.getProviderKey).toHaveBeenCalledWith(expectedProvider);
    });
  });

  describe('defaultUpstreamModel (API key override)', () => {
    it('uses override for LiteLLM body and provider resolution', async () => {
      const u: UserContext = {
        ...testUser,
        defaultUpstreamModel: 'gemini-2.0-flash',
      };
      await service.handleRequest(u, { model: 'claude-sonnet-4-20250514', messages: [] });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ model: 'gemini-2.0-flash' }),
        expect.any(Object),
      );
      expect(vault.getProviderKey).toHaveBeenCalledWith('google');
    });

    it('throws when model missing and no override', async () => {
      await expect(service.handleRequest(testUser, { messages: [] })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

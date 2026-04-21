import { Test, TestingModule } from '@nestjs/testing';
import { BudgetService, PolicyLimits } from './budget.service';
import { RedisService } from '../../redis/redis.service';
import { PricingService } from './pricing.service';

const mockRedis = () => ({
  get: jest.fn().mockResolvedValue(null),
  incrbyfloat: jest.fn().mockResolvedValue(1.5),
  expire: jest.fn().mockResolvedValue(undefined),
});

const mockPricing = () => ({
  estimateCost: jest.fn().mockReturnValue(0.01),
});

const unlimitedPolicy: PolicyLimits = { monthlyBudgetUsd: 0 };
const cappedPolicy: PolicyLimits = { monthlyBudgetUsd: 100 };
const fallbackPolicy: PolicyLimits = {
  monthlyBudgetUsd: 100,
  fallback: { thresholdPct: 90, fromModel: 'claude-opus-4', toModel: 'claude-haiku-4' },
};

describe('BudgetService', () => {
  let service: BudgetService;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: RedisService, useFactory: mockRedis },
        { provide: PricingService, useFactory: mockPricing },
      ],
    }).compile();

    service = module.get(BudgetService);
    redis = module.get(RedisService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  // ── checkAndEnforceBudget ─────────────────────────────────────────────────

  describe('checkAndEnforceBudget', () => {
    it('allows when user is under budget', async () => {
      (redis.get as jest.Mock).mockResolvedValue('50');
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-haiku-4', cappedPolicy);
      expect(result.allowed).toBe(true);
      expect(result.currentCostUsd).toBe(50);
    });

    it('denies when user is at cap', async () => {
      (redis.get as jest.Mock).mockResolvedValue('100');
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-haiku-4', cappedPolicy);
      expect(result.allowed).toBe(false);
      expect(result.usagePct).toBe(100);
    });

    it('denies when user exceeds cap', async () => {
      (redis.get as jest.Mock).mockResolvedValue('120');
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-haiku-4', cappedPolicy);
      expect(result.allowed).toBe(false);
    });

    it('always allows when monthlyBudgetUsd is 0 (unlimited)', async () => {
      (redis.get as jest.Mock).mockResolvedValue('9999');
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-haiku-4', unlimitedPolicy);
      expect(result.allowed).toBe(true);
      expect(result.usagePct).toBe(0);
    });

    it('returns allowed + usagePct when key is missing', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-haiku-4', cappedPolicy);
      expect(result.allowed).toBe(true);
      expect(result.currentCostUsd).toBe(0);
    });

    it('fails open when Redis throws', async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error('Redis down'));
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-haiku-4', cappedPolicy);
      expect(result.allowed).toBe(true);
      expect(result.currentCostUsd).toBe(0);
    });

    it('applies fallback model when threshold met and fromModel matches', async () => {
      (redis.get as jest.Mock).mockResolvedValue('92'); // 92% of $100
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-opus-4', fallbackPolicy);
      expect(result.allowed).toBe(true);
      expect(result.fallbackModel).toBe('claude-haiku-4');
    });

    it('does not apply fallback when fromModel does not match', async () => {
      (redis.get as jest.Mock).mockResolvedValue('92');
      const result = await service.checkAndEnforceBudget('u1', null, 'gpt-4', fallbackPolicy);
      // 92% >= 100 cap: denied
      expect(result.fallbackModel).toBeUndefined();
    });

    it('does not apply fallback when threshold not yet reached', async () => {
      (redis.get as jest.Mock).mockResolvedValue('80'); // 80% < 90% threshold
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-opus-4', fallbackPolicy);
      expect(result.fallbackModel).toBeUndefined();
    });

    it('calculates usagePct correctly', async () => {
      (redis.get as jest.Mock).mockResolvedValue('75');
      const result = await service.checkAndEnforceBudget('u1', null, 'claude-haiku-4', cappedPolicy);
      expect(result.usagePct).toBe(75);
    });
  });

  // ── recordActualCost ─────────────────────────────────────────────────────

  describe('recordActualCost', () => {
    it('increments user key', async () => {
      await service.recordActualCost('u1', null, 0.05);
      expect(redis.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('budget:user:u1:cost_month:'),
        0.05,
      );
    });

    it('also increments team key when teamId provided', async () => {
      await service.recordActualCost('u1', 't1', 0.05);
      expect(redis.incrbyfloat).toHaveBeenCalledTimes(2);
      expect(redis.incrbyfloat).toHaveBeenCalledWith(
        expect.stringContaining('budget:team:t1:cost_month:'),
        0.05,
      );
    });

    it('skips team key when teamId is null', async () => {
      await service.recordActualCost('u1', null, 0.05);
      expect(redis.incrbyfloat).toHaveBeenCalledTimes(1);
    });

    it('sets 35-day TTL on user key', async () => {
      await service.recordActualCost('u1', null, 0.05);
      expect(redis.expire).toHaveBeenCalledWith(
        expect.stringContaining('budget:user:u1'),
        35 * 24 * 60 * 60,
      );
    });

    it('handles Redis error without throwing', async () => {
      (redis.incrbyfloat as jest.Mock).mockRejectedValue(new Error('Redis error'));
      await expect(service.recordActualCost('u1', null, 0.05)).resolves.toBeUndefined();
    });
  });

  // ── getUserMonthlyCost ────────────────────────────────────────────────────

  describe('getUserMonthlyCost', () => {
    it('returns 0 when key does not exist', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);
      const cost = await service.getUserMonthlyCost('u1');
      expect(cost).toBe(0);
    });

    it('returns parsed float when key exists', async () => {
      (redis.get as jest.Mock).mockResolvedValue('12.345');
      const cost = await service.getUserMonthlyCost('u1');
      expect(cost).toBe(12.345);
    });
  });

  // ── getTeamMonthlyCost ────────────────────────────────────────────────────

  describe('getTeamMonthlyCost', () => {
    it('returns 0 when key does not exist', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);
      const cost = await service.getTeamMonthlyCost('t1');
      expect(cost).toBe(0);
    });

    it('returns parsed float when key exists', async () => {
      (redis.get as jest.Mock).mockResolvedValue('99.9');
      const cost = await service.getTeamMonthlyCost('t1');
      expect(cost).toBe(99.9);
    });
  });
});

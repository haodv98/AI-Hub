import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetService } from '../budget/budget.service';
import { AlertsService } from '../alerts/alerts.service';
import { UsageEvent } from './usage.types';

const mockPrisma = () => ({
  $executeRaw: jest.fn().mockResolvedValue(1),
  $queryRaw: jest.fn().mockResolvedValue([]),
  apiKey: { update: jest.fn().mockResolvedValue({}) },
  team: {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

const mockBudget = () => ({
  recordActualCost: jest.fn().mockResolvedValue(undefined),
  getTeamMonthlyCost: jest.fn().mockResolvedValue(0),
});

const mockAlerts = () => ({
  checkTeamBudgetThresholds: jest.fn().mockResolvedValue(undefined),
  checkSpikeDetection: jest.fn().mockResolvedValue(undefined),
});

const sampleEvent: UsageEvent = {
  userId: 'u1',
  teamId: 't1',
  apiKeyId: 'k1',
  model: 'claude-haiku-4',
  provider: 'anthropic',
  promptTokens: 100,
  completionTokens: 50,
  totalTokens: 150,
  costUsd: 0.001,
  latencyMs: 500,
};

describe('UsageService', () => {
  let service: UsageService;
  let prisma: ReturnType<typeof mockPrisma>;
  let budget: ReturnType<typeof mockBudget>;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: BudgetService, useFactory: mockBudget },
        { provide: AlertsService, useFactory: mockAlerts },
      ],
    }).compile();

    service = module.get(UsageService);
    prisma = module.get(PrismaService) as any;
    budget = module.get(BudgetService) as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── recordEvent ───────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('returns void immediately (fire-and-forget)', () => {
      const result = service.recordEvent(sampleEvent);
      expect(result).toBeUndefined();
    });

    it('writes to TimescaleDB via $executeRaw after microtask', async () => {
      service.recordEvent(sampleEvent);
      await Promise.resolve(); // flush microtask queue
      jest.runAllTimers();
      await Promise.resolve();
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('updates budget counters after persisting', async () => {
      service.recordEvent(sampleEvent);
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
      expect(budget.recordActualCost).toHaveBeenCalledWith('u1', 't1', 0.001);
    });

    it('retries on transient DB failure', async () => {
      (prisma.$executeRaw as jest.Mock)
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(1);

      service.recordEvent(sampleEvent);
      await Promise.resolve();

      // First attempt fails — retry delay = 500ms
      jest.advanceTimersByTime(500);
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('logs error after max retries without throwing', async () => {
      (prisma.$executeRaw as jest.Mock).mockRejectedValue(new Error('permanent'));
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => {});

      service.recordEvent(sampleEvent);

      // runAllTimersAsync flushes timers + microtasks until no more are pending
      await jest.runAllTimersAsync();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('permanently failed'));
      logSpy.mockRestore();
    });
  });

  // ── onApplicationShutdown ─────────────────────────────────────────────────

  describe('onApplicationShutdown', () => {
    it('resolves immediately when no pending events', async () => {
      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });

    it('waits for pending events to settle', async () => {
      // Put a pending event in flight
      service.recordEvent(sampleEvent);
      await Promise.resolve(); // start persist

      const shutdownPromise = service.onApplicationShutdown();

      jest.runAllTimers();
      await Promise.resolve();

      // Settle shutdown
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();

      await expect(shutdownPromise).resolves.toBeUndefined();
    });
  });

  // ── getUserUsage ──────────────────────────────────────────────────────────

  describe('getUserUsage', () => {
    it('queries by model when groupBy=model', async () => {
      const mockData = [{ model: 'claude-haiku-4', costUsd: 5, totalTokens: 1000, promptTokens: 700, completionTokens: 300, requestCount: 10 }];
      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockData);

      const result = await service.getUserUsage('u1', new Date('2026-01-01'), new Date('2026-01-31'), 'model');
      expect(result).toEqual(mockData);
    });

    it('queries by day when no groupBy', async () => {
      const mockData = [{ date: new Date('2026-01-01'), costUsd: 5, totalTokens: 1000, requestCount: 10 }];
      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockData);

      const result = await service.getUserUsage('u1', new Date('2026-01-01'), new Date('2026-01-31'));
      expect(result).toEqual(mockData);
    });
  });

  // ── getTeamUsage ──────────────────────────────────────────────────────────

  describe('getTeamUsage', () => {
    it('returns usage summary rows', async () => {
      const mockData = [{ date: new Date('2026-01-01'), costUsd: 20, totalTokens: 5000, requestCount: 50 }];
      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockData);

      const result = await service.getTeamUsage('t1', new Date('2026-01-01'), new Date('2026-01-31'));
      expect(result).toEqual(mockData);
    });
  });

  // ── getOrgSummary ─────────────────────────────────────────────────────────

  describe('getOrgSummary', () => {
    it('returns enriched summary payload', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ total_cost: 100, total_tokens: 2000, total_requests: 25, team_count: 2 }])
        .mockResolvedValueOnce([{ date: new Date('2026-01-01'), cost_usd: 100, total_tokens: 2000, request_count: 25 }])
        .mockResolvedValueOnce([{ team_id: 'team-1', team_name: 'Platform', cost_usd: 80, total_tokens: 1500, request_count: 15 }])
        .mockResolvedValueOnce([{ provider: 'openai', value: 60 }])
        .mockResolvedValueOnce([{ model: 'gpt-4o', request_count: 20 }])
        .mockResolvedValueOnce([{ user_id: 'u1', user_name: 'Alice', team_name: 'Platform', spend_usd: 70, tokens: 1200 }])
        .mockResolvedValueOnce([{ user_id: 'u1', spend_usd: 50 }])
        .mockResolvedValueOnce([{ avg_ms: 320 }])
        .mockResolvedValueOnce([{ team_id: 'team-1', spend_usd: 80 }])
        .mockResolvedValueOnce([{ total_cost: 80, total_tokens: 1800, total_requests: 20 }]);

      (prisma.team.findMany as jest.Mock).mockResolvedValue([
        { id: 'team-1', monthlyBudgetUsd: 100, _count: { members: 4 } },
      ]);

      const result = await service.getOrgSummary(new Date('2026-01-01'), new Date('2026-01-31'));

      expect(result.providerBreakdown).toEqual([{ provider: 'openai', value: 60 }]);
      expect(result.modelUsage).toEqual([{ model: 'gpt-4o', requestCount: 20 }]);
      expect(result.topUsers[0]).toMatchObject({
        userId: 'u1',
        name: 'Alice',
        team: 'Platform',
        spendUsd: 70,
      });
      expect(result.latency.avgMs).toBe(320);
      expect(result.teamUsage[0]).toMatchObject({
        teamId: 'team-1',
        spendUsd: 80,
        members: 4,
      });
      expect(result.trends.spendPct).toBeGreaterThan(0);
    });
  });
});

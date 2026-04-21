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
  team: { findUnique: jest.fn().mockResolvedValue(null) },
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
});

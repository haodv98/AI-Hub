import { Test, TestingModule } from '@nestjs/testing';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const mockPrisma = () => ({
  alertLog: { create: jest.fn().mockResolvedValue({}) },
  $queryRaw: jest.fn(),
});

const mockRedis = () => ({
  setNx: jest.fn().mockResolvedValue(true),
});

describe('AlertsService', () => {
  let service: AlertsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: RedisService, useFactory: mockRedis },
      ],
    }).compile();

    service = module.get(AlertsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get(RedisService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  // ── checkUserBudgetThresholds ─────────────────────────────────────────────

  describe('checkUserBudgetThresholds', () => {
    it('skips all checks when budgetCap is 0', async () => {
      await service.checkUserBudgetThresholds('u1', null, 50, 0);
      expect(redis.setNx).not.toHaveBeenCalled();
    });

    it('skips all checks when budgetCap is negative', async () => {
      await service.checkUserBudgetThresholds('u1', null, 50, -100);
      expect(redis.setNx).not.toHaveBeenCalled();
    });

    it('fires no alerts when usage is below 70%', async () => {
      await service.checkUserBudgetThresholds('u1', null, 60, 100);
      expect(redis.setNx).not.toHaveBeenCalled();
      expect(prisma.alertLog.create).not.toHaveBeenCalled();
    });

    it('fires 70% alert when usage is exactly 70', async () => {
      await service.checkUserBudgetThresholds('u1', null, 70, 100);
      expect(redis.setNx).toHaveBeenCalledTimes(1);
      expect(redis.setNx).toHaveBeenCalledWith(
        expect.stringContaining(':70:'),
        '1',
        86400,
      );
      expect(prisma.alertLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ alertType: 'BUDGET_70' }) }),
      );
    });

    it('fires 90% alert when usage is exactly 90', async () => {
      await service.checkUserBudgetThresholds('u1', null, 90, 100);
      expect(redis.setNx).toHaveBeenCalledTimes(2); // 70 + 90
      expect(prisma.alertLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ alertType: 'BUDGET_90' }) }),
      );
    });

    it('fires all three alerts at 100%', async () => {
      await service.checkUserBudgetThresholds('u1', null, 100, 100);
      expect(redis.setNx).toHaveBeenCalledTimes(3);
      expect(prisma.alertLog.create).toHaveBeenCalledTimes(3);
    });

    it('does not persist when Redis debounce key already exists', async () => {
      (redis.setNx as jest.Mock).mockResolvedValue(false);
      await service.checkUserBudgetThresholds('u1', null, 100, 100);
      expect(prisma.alertLog.create).not.toHaveBeenCalled();
    });

    it('debounce key includes userId and threshold', async () => {
      await service.checkUserBudgetThresholds('user-xyz', null, 75, 100);
      const call = (redis.setNx as jest.Mock).mock.calls[0][0] as string;
      expect(call).toContain('user-xyz');
      expect(call).toContain(':70:');
    });
  });

  // ── checkTeamBudgetThresholds ─────────────────────────────────────────────

  describe('checkTeamBudgetThresholds', () => {
    it('skips when budgetCap is 0', async () => {
      await service.checkTeamBudgetThresholds('t1', 50, 0);
      expect(redis.setNx).not.toHaveBeenCalled();
    });

    it('fires TEAM_BUDGET_70 at 70%', async () => {
      await service.checkTeamBudgetThresholds('t1', 70, 100);
      expect(prisma.alertLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ alertType: 'TEAM_BUDGET_70', teamId: 't1' }) }),
      );
    });

    it('fires all three team alerts at 100%', async () => {
      await service.checkTeamBudgetThresholds('t1', 100, 100);
      expect(redis.setNx).toHaveBeenCalledTimes(3);
      expect(prisma.alertLog.create).toHaveBeenCalledTimes(3);
    });

    it('debounce key uses team: prefix', async () => {
      await service.checkTeamBudgetThresholds('team-abc', 75, 100);
      const key = (redis.setNx as jest.Mock).mock.calls[0][0] as string;
      expect(key).toContain('alert:team:team-abc:70:');
    });
  });

  // ── checkSpikeDetection ───────────────────────────────────────────────────

  describe('checkSpikeDetection', () => {
    it('skips when 7-day average is null (no history)', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_cost: null }]);
      await service.checkSpikeDetection('t1', 50);
      expect(redis.setNx).not.toHaveBeenCalled();
    });

    it('skips when 7-day average is 0', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_cost: 0 }]);
      await service.checkSpikeDetection('t1', 100);
      expect(redis.setNx).not.toHaveBeenCalled();
    });

    it('skips when spike multiple is below 3x', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_cost: 20 }]);
      await service.checkSpikeDetection('t1', 50); // 2.5x — below threshold
      expect(redis.setNx).not.toHaveBeenCalled();
    });

    it('fires alert when spike is exactly 3x', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_cost: 10 }]);
      await service.checkSpikeDetection('t1', 30); // 3x
      expect(redis.setNx).toHaveBeenCalledWith(expect.stringContaining('spike'), '1', 86400);
      expect(prisma.alertLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ alertType: 'SPIKE', teamId: 't1' }) }),
      );
    });

    it('fires alert when spike is more than 3x', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_cost: 5 }]);
      await service.checkSpikeDetection('t1', 50); // 10x
      expect(prisma.alertLog.create).toHaveBeenCalled();
    });

    it('does not persist when debounce key exists', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_cost: 5 }]);
      (redis.setNx as jest.Mock).mockResolvedValue(false);
      await service.checkSpikeDetection('t1', 50);
      expect(prisma.alertLog.create).not.toHaveBeenCalled();
    });

    it('handles DB query error gracefully without throwing', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB error'));
      await expect(service.checkSpikeDetection('t1', 100)).resolves.toBeUndefined();
    });

    it('handles NaN average from DB gracefully', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg_cost: NaN }]);
      await service.checkSpikeDetection('t1', 100);
      expect(redis.setNx).not.toHaveBeenCalled();
    });
  });
});

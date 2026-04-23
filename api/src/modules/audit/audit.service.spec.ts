import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

const mockPrisma = () => ({
  auditLog: {
    count: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
});

describe('AuditService', () => {
  let service: AuditService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useFactory: mockPrisma },
      ],
    }).compile();

    service = module.get(AuditService);
    prisma = module.get(PrismaService) as any;
  });

  it('lists logs with pagination mapping', async () => {
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        action: AuditAction.KEY_GENERATE,
        targetType: 'API_KEY',
        targetId: 'k1',
        details: { foo: 'bar' },
        actor: { fullName: 'Admin', email: 'admin@aihub.internal' },
      },
    ]);

    const result = await service.listLogs({ q: 'admin', page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toEqual({
      id: 'log-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      actor: { name: 'Admin', email: 'admin@aihub.internal' },
      action: AuditAction.KEY_GENERATE,
      targetType: 'API_KEY',
      targetId: 'k1',
      details: { foo: 'bar' },
    });
  });

  it('writes audit logs asynchronously', async () => {
    prisma.auditLog.create.mockResolvedValue({});

    service.log({ action: AuditAction.KEY_GENERATE, targetType: 'API_KEY' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('does not throw when async write fails', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db unavailable'));
    const loggerSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

    expect(() => service.log({ action: AuditAction.KEY_GENERATE })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(loggerSpy).toHaveBeenCalled();
    loggerSpy.mockRestore();
  });
});

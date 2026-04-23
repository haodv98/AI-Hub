import { HrService } from './hr.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { KeysService } from '../../keys/keys.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../../audit/audit.service';

const mockPrisma = () => {
  const user = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const teamMember = {
    upsert: jest.fn(),
    updateMany: jest.fn(),
  };

  return {
    user,
    team: {
      findFirst: jest.fn(),
    },
    teamMember,
    providerKey: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) =>
      fn({
        user,
        teamMember,
        providerKey: {
          updateMany: jest.fn(),
        },
      }),
    ),
  };
};

const mockRedis = () => ({
  setNx: jest.fn().mockResolvedValue(true),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
});

const mockKeys = () => ({
  getMyKey: jest.fn().mockResolvedValue(null),
  generateKey: jest.fn().mockResolvedValue({ key: { id: 'k1' }, plaintext: 'aihub_prod_x' }),
  rotateKey: jest.fn().mockResolvedValue({ key: { id: 'k2' }, plaintext: 'aihub_prod_y' }),
  revokeAllUserKeys: jest.fn().mockResolvedValue(1),
});

const mockEmail = () => ({
  sendOnboardingKeyDelivery: jest.fn().mockResolvedValue(undefined),
});

const mockAudit = () => ({
  log: jest.fn(),
});

const mockConfig = () => ({
  get: jest.fn(() => undefined),
});

describe('HrService', () => {
  let service: HrService;
  let prisma: ReturnType<typeof mockPrisma>;
  let redis: ReturnType<typeof mockRedis>;
  let keys: ReturnType<typeof mockKeys>;
  let email: ReturnType<typeof mockEmail>;

  beforeEach(() => {
    prisma = mockPrisma();
    redis = mockRedis();
    keys = mockKeys();
    email = mockEmail();
    service = new HrService(
      mockConfig() as unknown as ConfigService,
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      keys as unknown as KeysService,
      email as unknown as EmailService,
      mockAudit() as unknown as AuditService,
    );
  });

  it('deduplicates already processed events', async () => {
    redis.setNx.mockResolvedValueOnce(false);
    const result = await service.handleEvent({
      id: 'evt-1',
      type: 'employee.onboarded',
      payload: { email: 'a@company.com' },
    });
    expect(result).toEqual({ processed: false, deduped: true });
  });

  it('onboards and queues secure onboarding email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@company.com' });
    prisma.team.findFirst.mockResolvedValue({ id: 't1' });

    await service.handleEvent({
      id: 'evt-2',
      type: 'employee.onboarded',
      payload: {
        email: 'a@company.com',
        fullName: 'User A',
        department: 'Engineering - Backend',
        title: 'Senior Engineer',
      },
    });

    expect(prisma.teamMember.upsert).toHaveBeenCalled();
    expect(keys.generateKey).toHaveBeenCalledWith('u1', 'system');
    expect(email.sendOnboardingKeyDelivery).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'a@company.com',
      keyId: 'k1',
      keyPlaintext: 'aihub_prod_x',
    });
  });

  it('reactivates offboarded user on onboard event', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'OFFBOARDED' });
    prisma.team.findFirst.mockResolvedValue({ id: 't1' });

    await service.handleEvent({
      id: 'evt-2b',
      type: 'employee.onboarded',
      payload: {
        email: 'a@company.com',
        department: 'Engineering - Backend',
      },
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ status: 'ACTIVE', offboardedAt: null }),
      }),
    );
    expect(keys.generateKey).toHaveBeenCalledWith('u1', 'system');
    expect(email.sendOnboardingKeyDelivery).toHaveBeenCalled();
  });

  it('offboards existing user by email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    await service.handleEvent({
      id: 'evt-3',
      type: 'employee.offboarded',
      payload: { email: 'a@company.com' },
    });

    expect(keys.revokeAllUserKeys).toHaveBeenCalledWith('u1', 'system');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('transfers user and rotates key when existing key exists', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.team.findFirst.mockResolvedValue({ id: 't2' });
    keys.getMyKey.mockResolvedValueOnce({ id: 'existing-key' });

    await service.handleEvent({
      id: 'evt-4',
      type: 'employee.transferred',
      payload: {
        email: 'a@company.com',
        department: 'DevOps',
        title: 'Lead DevOps',
      },
    });

    expect(keys.rotateKey).toHaveBeenCalledWith('existing-key', 'system');
    expect(email.sendOnboardingKeyDelivery).toHaveBeenCalledWith({
      userId: 'u1',
      email: 'a@company.com',
      keyId: 'k2',
      keyPlaintext: 'aihub_prod_y',
    });
  });
});

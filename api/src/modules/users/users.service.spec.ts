import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KeysService } from '../keys/keys.service';
import { UserRole, UserStatus, ProviderType } from '@prisma/client';
import { VaultService } from '../../vault/vault.service';
import { EmailService } from '../integrations/email/email.service';

const mockPrisma = () => {
  const user = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
  const providerKey = {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const team = {
    findMany: jest.fn(),
  };
  const teamMember = {
    create: jest.fn(),
  };

  return {
    user,
    providerKey,
    team,
    teamMember,
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn({ user, teamMember })),
  };
};

const mockAudit = () => ({
  log: jest.fn(),
});

const mockKeys = () => ({
  revokeAllUserKeys: jest.fn().mockResolvedValue(2),
  getMyKey: jest.fn().mockResolvedValue({ id: 'existing-key' }),
  generateKey: jest.fn().mockResolvedValue({ key: { id: 'k-generated' }, plaintext: 'aihub_prod_generated' }),
});

const mockVault = () => ({
  writeSecret: jest.fn().mockResolvedValue(undefined),
});

const mockEmail = () => ({
  sendOnboardingKeyDelivery: jest.fn().mockResolvedValue(undefined),
});

const fakeUser = {
  id: 'u1',
  email: 'dev@company.com',
  fullName: 'Dev User',
  role: UserRole.MEMBER,
  status: UserStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
  offboardedAt: null,
  teamMembers: [],
  apiKeys: [],
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: ReturnType<typeof mockPrisma>;
  let keys: ReturnType<typeof mockKeys>;
  let vault: ReturnType<typeof mockVault>;
  let email: ReturnType<typeof mockEmail>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: AuditService, useFactory: mockAudit },
        { provide: KeysService, useFactory: mockKeys },
        { provide: VaultService, useFactory: mockVault },
        { provide: EmailService, useFactory: mockEmail },
      ],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService) as any;
    keys = module.get(KeysService) as any;
    vault = module.get(VaultService) as any;
    email = module.get(EmailService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated users and total count', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([fakeUser]);
      (prisma.user.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.users).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('applies status filter', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, status: UserStatus.ACTIVE });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: UserStatus.ACTIVE }) }),
      );
    });

    it('applies teamId filter via teamMembers relation', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, teamId: 'team-1' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teamMembers: { some: { teamId: 'team-1' } } }),
        }),
      );
    });

    it('calculates skip from page and limit', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 20 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns user when found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser);
      const result = await service.findById('u1');
      expect(result).toEqual(fakeUser);
    });

    it('throws NotFoundException when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates user with default MEMBER role', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(fakeUser);
      await service.create({ email: 'dev@company.com', fullName: 'Dev User' }, 'actor1');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: UserRole.MEMBER }),
        }),
      );
    });

    it('uses provided role when given', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue({ ...fakeUser, role: UserRole.IT_ADMIN });
      await service.create({ email: 'admin@company.com', fullName: 'Admin', role: UserRole.IT_ADMIN }, 'actor1');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: UserRole.IT_ADMIN }),
        }),
      );
    });

    it('returns created user', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(fakeUser);
      const result = await service.create({ email: 'dev@company.com', fullName: 'Dev User' }, 'actor1');
      expect(result).toEqual(fakeUser);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates user and returns result', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser);
      const updated = { ...fakeUser, fullName: 'Updated Name' };
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update('u1', { fullName: 'Updated Name' }, 'actor1');
      expect(result.fullName).toBe('Updated Name');
    });

    it('throws NotFoundException when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.update('missing', {}, 'actor1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── offboard ──────────────────────────────────────────────────────────────

  describe('offboard', () => {
    it('revokes all user keys before updating status', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser);
      const offboarded = { ...fakeUser, status: UserStatus.OFFBOARDED };
      (prisma.user.update as jest.Mock).mockResolvedValue(offboarded);

      await service.offboard('u1', 'actor1');

      expect(keys.revokeAllUserKeys).toHaveBeenCalledWith('u1', 'actor1');
      expect(prisma.providerKey.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', scope: 'PER_SEAT' }),
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('sets status to OFFBOARDED and records offboardedAt', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser);
      const offboarded = { ...fakeUser, status: UserStatus.OFFBOARDED };
      (prisma.user.update as jest.Mock).mockResolvedValue(offboarded);

      await service.offboard('u1', 'actor1');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: UserStatus.OFFBOARDED,
            offboardedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('returns updated user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser);
      const offboarded = { ...fakeUser, status: UserStatus.OFFBOARDED };
      (prisma.user.update as jest.Mock).mockResolvedValue(offboarded);

      const result = await service.offboard('u1', 'actor1');
      expect(result.status).toBe(UserStatus.OFFBOARDED);
    });

    it('throws NotFoundException when user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.offboard('missing', 'actor1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignPerSeatKey', () => {
    it('writes secret and creates provider key record when not existing', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser);
      (prisma.providerKey.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.providerKey.create as jest.Mock).mockResolvedValue({});
      (keys.getMyKey as jest.Mock).mockResolvedValue(null);
      (keys.generateKey as jest.Mock).mockResolvedValue({ plaintext: 'aihub_prod_generated' });

      const result = await service.assignPerSeatKey(
        'u1',
        { provider: ProviderType.ANTHROPIC, apiKey: 'sk-ant-123' },
        'actor1',
      );

      expect(vault.writeSecret).toHaveBeenCalledWith(
        'kv/aihub/providers/anthropic/users/u1',
        { api_key: 'sk-ant-123' },
      );
      expect(prisma.providerKey.create).toHaveBeenCalled();
      expect(keys.generateKey).toHaveBeenCalledWith('u1', 'actor1');
      expect(result.issuedApiKey).toBe('aihub_prod_generated');
    });
  });

  describe('bulkImportPerSeatKeys', () => {
    it('returns error for unknown provider value', async () => {
      const csv = ['email,provider,api_key', 'a@company.com,unknown,sk-123'].join('\n');
      const result = await service.bulkImportPerSeatKeys(csv, 'actor1');
      expect(result.success).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('bulkImportUsers', () => {
    it('validates all rows first and returns errors without processing', async () => {
      (prisma.team.findMany as jest.Mock).mockResolvedValue([{ id: 't1', name: 'Backend' }]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const csv = ['email,full_name,team,tier', 'a@company.com,User A,Backend,MEMBER', 'b@company.com,User B,MissingTeam,LEAD'].join('\n');

      const result = await service.bulkImportUsers(csv, 'actor1');
      expect(result.success).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.deliveryQueued).toBe(0);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates user + membership + internal key when CSV is valid', async () => {
      (prisma.team.findMany as jest.Mock).mockResolvedValue([{ id: 't1', name: 'Backend' }]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'u-new', email: 'a@company.com' });
      (prisma.teamMember.create as jest.Mock).mockResolvedValue({});

      const csv = ['email,full_name,team,tier', 'a@company.com,User A,Backend,MEMBER'].join('\n');
      const result = await service.bulkImportUsers(csv, 'actor1');

      expect(result.success).toBe(1);
      expect(result.deliveryQueued).toBe(1);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.teamMember.create).toHaveBeenCalled();
      expect(keys.generateKey).toHaveBeenCalledWith('u-new', 'actor1');
      expect(email.sendOnboardingKeyDelivery).toHaveBeenCalledWith({
        userId: 'u-new',
        email: 'a@company.com',
        keyId: 'k-generated',
        keyPlaintext: 'aihub_prod_generated',
      });
    });

    it('returns partial success when onboarding email delivery fails', async () => {
      (prisma.team.findMany as jest.Mock).mockResolvedValue([{ id: 't1', name: 'Backend' }]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'u-new-1', email: 'a@company.com' })
        .mockResolvedValueOnce({ id: 'u-new-2', email: 'b@company.com' });
      (prisma.teamMember.create as jest.Mock).mockResolvedValue({});
      (keys.generateKey as jest.Mock)
        .mockResolvedValueOnce({ key: { id: 'k-1' }, plaintext: 'aihub_prod_generated_1' })
        .mockResolvedValueOnce({ key: { id: 'k-2' }, plaintext: 'aihub_prod_generated_2' });
      (email.sendOnboardingKeyDelivery as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('SMTP down'));

      const csv = [
        'email,full_name,team,tier',
        'a@company.com,User A,Backend,MEMBER',
        'b@company.com,User B,Backend,MEMBER',
      ].join('\n');

      const result = await service.bulkImportUsers(csv, 'actor1');
      expect(result.success).toBe(2);
      expect(result.deliveryQueued).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(3);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('rolls back created user when key generation fails', async () => {
      (prisma.team.findMany as jest.Mock).mockResolvedValue([{ id: 't1', name: 'Backend' }]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'u-new-1', email: 'a@company.com' });
      (prisma.teamMember.create as jest.Mock).mockResolvedValue({});
      (keys.generateKey as jest.Mock).mockRejectedValue(new Error('keygen failed'));

      const csv = ['email,full_name,team,tier', 'a@company.com,User A,Backend,MEMBER'].join('\n');
      const result = await service.bulkImportUsers(csv, 'actor1');

      expect(result.success).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u-new-1' } });
    });
  });
});

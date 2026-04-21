import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KeysService } from '../keys/keys.service';
import { UserRole, UserStatus } from '@prisma/client';

const mockPrisma = () => ({
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
});

const mockAudit = () => ({
  log: jest.fn(),
});

const mockKeys = () => ({
  revokeAllUserKeys: jest.fn().mockResolvedValue(2),
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: AuditService, useFactory: mockAudit },
        { provide: KeysService, useFactory: mockKeys },
      ],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService) as any;
    keys = module.get(KeysService) as any;
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
});

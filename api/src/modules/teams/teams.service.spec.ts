import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KeysService } from '../keys/keys.service';
import { TeamMemberTier } from '@prisma/client';

const mockPrisma = () => ({
  team: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  teamMember: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
});

const mockAudit = () => ({
  log: jest.fn(),
});

const mockKeys = () => ({
  getMyKey: jest.fn().mockResolvedValue(null),
  generateKey: jest.fn().mockResolvedValue({ plaintext: 'aihub_prod_testkey123' }),
});

const fakeTeam = {
  id: 'team-1',
  name: 'Backend',
  description: null,
  monthlyBudgetUsd: 500,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let keys: ReturnType<typeof mockKeys>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: AuditService, useFactory: mockAudit },
        { provide: KeysService, useFactory: mockKeys },
      ],
    }).compile();

    service = module.get(TeamsService);
    prisma = module.get(PrismaService) as any;
    keys = module.get(KeysService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all teams ordered by name', async () => {
      (prisma.team.findMany as jest.Mock).mockResolvedValue([fakeTeam]);
      const result = await service.findAll();
      expect(result).toEqual([fakeTeam]);
      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns team when found', async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(fakeTeam);
      const result = await service.findById('team-1');
      expect(result).toEqual(fakeTeam);
    });

    it('throws NotFoundException when team does not exist', async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates team and logs audit', async () => {
      (prisma.team.create as jest.Mock).mockResolvedValue(fakeTeam);
      const result = await service.create({ name: 'Backend', monthlyBudgetUsd: 500 }, 'actor1');
      expect(result).toEqual(fakeTeam);
      expect(prisma.team.create).toHaveBeenCalled();
    });

    it('uses 0 as default monthly budget when not provided', async () => {
      (prisma.team.create as jest.Mock).mockResolvedValue({ ...fakeTeam, monthlyBudgetUsd: 0 });
      await service.create({ name: 'No budget team' }, 'actor1');
      expect(prisma.team.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ monthlyBudgetUsd: 0 }) }),
      );
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates team fields', async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(fakeTeam);
      (prisma.team.update as jest.Mock).mockResolvedValue({ ...fakeTeam, name: 'Renamed' });
      const result = await service.update('team-1', { name: 'Renamed' }, 'actor1');
      expect(result.name).toBe('Renamed');
    });

    it('throws NotFoundException when team does not exist', async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.update('missing', { name: 'x' }, 'actor1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes empty team', async () => {
      const emptyTeam = { ...fakeTeam, _count: { members: 0 } };
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(emptyTeam);
      await service.delete('team-1', 'actor1');
      expect(prisma.team.delete).toHaveBeenCalledWith({ where: { id: 'team-1' } });
    });

    it('throws BadRequestException when team has members', async () => {
      const teamWithMembers = { ...fakeTeam, _count: { members: 3 } };
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(teamWithMembers);
      await expect(service.delete('team-1', 'actor1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when team does not exist', async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.delete('missing', 'actor1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── addMember ─────────────────────────────────────────────────────────────

  describe('addMember', () => {
    const membership = { id: 'tm-1', teamId: 'team-1', userId: 'u1', tier: TeamMemberTier.MEMBER };

    beforeEach(() => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(fakeTeam);
      (prisma.teamMember.create as jest.Mock).mockResolvedValue(membership);
    });

    it('creates membership with correct tier', async () => {
      const result = await service.addMember('team-1', 'u1', TeamMemberTier.SENIOR, 'actor1');
      expect(result.membership).toEqual(membership);
      expect(prisma.teamMember.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'u1', tier: TeamMemberTier.SENIOR },
      });
    });

    it('auto-generates key when user has none', async () => {
      (keys.getMyKey as jest.Mock).mockResolvedValue(null);
      const result = await service.addMember('team-1', 'u1', TeamMemberTier.MEMBER, 'actor1');
      expect(keys.generateKey).toHaveBeenCalledWith('u1', 'actor1');
      expect(result.generatedKey).toBe('aihub_prod_testkey123');
    });

    it('does not generate key when user already has one', async () => {
      (keys.getMyKey as jest.Mock).mockResolvedValue({ id: 'k1', status: 'ACTIVE' });
      const result = await service.addMember('team-1', 'u1', TeamMemberTier.MEMBER, 'actor1');
      expect(keys.generateKey).not.toHaveBeenCalled();
      expect(result.generatedKey).toBeUndefined();
    });
  });

  // ── removeMember ──────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('removes membership when found', async () => {
      const membership = { id: 'tm-1', teamId: 'team-1', userId: 'u1' };
      (prisma.teamMember.findUnique as jest.Mock).mockResolvedValue(membership);
      await service.removeMember('team-1', 'u1', 'actor1');
      expect(prisma.teamMember.delete).toHaveBeenCalledWith({
        where: { userId_teamId: { userId: 'u1', teamId: 'team-1' } },
      });
    });

    it('throws NotFoundException when member not in team', async () => {
      (prisma.teamMember.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.removeMember('team-1', 'u1', 'actor1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── changeTier ────────────────────────────────────────────────────────────

  describe('changeTier', () => {
    it('updates tier and returns membership', async () => {
      const updated = { id: 'tm-1', tier: TeamMemberTier.LEAD };
      (prisma.teamMember.update as jest.Mock).mockResolvedValue(updated);
      const result = await service.changeTier('team-1', 'u1', TeamMemberTier.LEAD, 'actor1');
      expect(result).toEqual(updated);
      expect(prisma.teamMember.update).toHaveBeenCalledWith({
        where: { userId_teamId: { userId: 'u1', teamId: 'team-1' } },
        data: { tier: TeamMemberTier.LEAD },
      });
    });
  });
});

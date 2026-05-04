import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KeysService } from '../keys/keys.service';
import { Team, TeamMemberTier } from '@prisma/client';
import { IsString, IsOptional, IsNumber, IsPositive } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Platform' })
  @IsString() name: string;

  @ApiPropertyOptional({ example: 'Platform engineering team' })
  @IsString() @IsOptional() description?: string;

  @ApiPropertyOptional({ example: 600, description: 'Monthly budget cap in USD' })
  @IsNumber() @IsPositive() @IsOptional() monthlyBudgetUsd?: number;
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ example: 'Platform' })
  @IsString() @IsOptional() name?: string;

  @ApiPropertyOptional()
  @IsString() @IsOptional() description?: string;

  @ApiPropertyOptional({ example: 600 })
  @IsNumber() @IsPositive() @IsOptional() monthlyBudgetUsd?: number;
}

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ teams: Team[]; total: number }> {
    const page  = params.page  ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const order = params.sortOrder ?? 'asc';
    const validSort = ['name', 'createdAt', 'updatedAt'];
    const sortBy = validSort.includes(params.sortBy ?? '') ? params.sortBy! : 'name';

    const where = params.search
      ? { name: { contains: params.search, mode: 'insensitive' as const } }
      : undefined;

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        orderBy: { [sortBy]: order },
        include: { _count: { select: { members: true } } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.team.count({ where }),
    ]);
    return { teams, total };
  }

  async findById(id: string): Promise<Team> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, fullName: true, status: true } } },
        },
        policies: { where: { isActive: true } },
      },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async create(dto: CreateTeamDto, actorId: string): Promise<Team> {
    const team = await this.prisma.team.create({
      data: { name: dto.name, description: dto.description, monthlyBudgetUsd: dto.monthlyBudgetUsd || 0 },
    });
    this.audit.log({ actorId, action: 'TEAM_CREATE', targetType: 'Team', targetId: team.id, details: { name: team.name } });
    return team;
  }

  async update(id: string, dto: UpdateTeamDto, actorId: string): Promise<Team> {
    await this.findById(id);
    const team = await this.prisma.team.update({ where: { id }, data: dto });
    this.audit.log({ actorId, action: 'TEAM_UPDATE', targetType: 'Team', targetId: id, details: dto as any });
    return team;
  }

  async delete(id: string, actorId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!team) throw new NotFoundException('Team not found');
    if ((team as any)._count.members > 0) {
      throw new BadRequestException('Cannot delete team with active members');
    }
    await this.prisma.team.delete({ where: { id } });
    this.audit.log({ actorId, action: 'TEAM_DELETE', targetType: 'Team', targetId: id, details: { name: team.name } });
  }

  async addMember(teamId: string, userId: string, tier: TeamMemberTier, actorId: string) {
    const team = await this.findById(teamId);

    const membership = await this.prisma.teamMember.create({
      data: { teamId, userId, tier },
    });

    // Auto-generate key if user doesn't have one
    const existingKey = await this.keys.getMyKey(userId);
    let generatedKey: string | undefined;
    if (!existingKey) {
      const { plaintext } = await this.keys.generateKey(userId, actorId);
      generatedKey = plaintext;
    }

    this.audit.log({ actorId, action: 'MEMBER_ADD', targetType: 'TeamMember', targetId: membership.id, details: { teamId, userId, tier } });
    return { membership, generatedKey };
  }

  async removeMember(teamId: string, userId: string, actorId: string) {
    const membership = await this.prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (!membership) throw new NotFoundException('Member not found in team');

    await this.prisma.teamMember.delete({ where: { userId_teamId: { userId, teamId } } });
    this.audit.log({ actorId, action: 'MEMBER_REMOVE', targetType: 'TeamMember', targetId: membership.id, details: { teamId, userId } });
  }

  async changeTier(teamId: string, userId: string, tier: TeamMemberTier, actorId: string) {
    const membership = await this.prisma.teamMember.update({
      where: { userId_teamId: { userId, teamId } },
      data: { tier },
    });
    this.audit.log({ actorId, action: 'MEMBER_TIER_CHANGE', targetType: 'TeamMember', targetId: membership.id, details: { teamId, userId, tier } });
    return membership;
  }

  // ── Policy attachment ──────────────────────────────────────────────────────

  async getTeamPolicies(teamId: string) {
    await this.findById(teamId); // 404 if not found
    return this.prisma.policy.findMany({
      where: { teamId },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async attachPolicy(teamId: string, policyId: string, actorId: string) {
    await this.findById(teamId);
    const policy = await this.prisma.policy.findUnique({ where: { id: policyId } });
    if (!policy) throw new NotFoundException(`Policy ${policyId} not found`);

    const updated = await this.prisma.policy.update({
      where: { id: policyId },
      data: { teamId },
    });
    this.audit.log({ actorId, action: 'POLICY_UPDATE', targetType: 'TEAM', targetId: teamId, details: { event: 'attach', policyId } });
    return updated;
  }

  async detachPolicy(teamId: string, policyId: string, actorId: string) {
    const policy = await this.prisma.policy.findFirst({ where: { id: policyId, teamId } });
    if (!policy) throw new NotFoundException(`Policy ${policyId} is not attached to team ${teamId}`);

    await this.prisma.policy.update({ where: { id: policyId }, data: { teamId: null } });
    this.audit.log({ actorId, action: 'POLICY_UPDATE', targetType: 'TEAM', targetId: teamId, details: { event: 'detach', policyId } });
  }

  async getEffectivePolicy(teamId: string) {
    await this.findById(teamId);
    return this.prisma.policy.findFirst({
      where: { teamId, isActive: true },
      orderBy: { priority: 'desc' },
    });
  }
}

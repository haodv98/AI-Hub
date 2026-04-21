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

  async findAll(): Promise<Team[]> {
    return this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
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
}

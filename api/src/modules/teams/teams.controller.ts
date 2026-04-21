import { Controller, Get, Post, Put, Delete, Param, Body, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { TeamsService, CreateTeamDto, UpdateTeamDto } from './teams.service';
import { UserRole, TeamMemberTier } from '@prisma/client';

@ApiTags('teams')
@Controller('v1/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all teams' })
  async list() {
    return ApiResponse.ok(await this.teams.findAll());
  }

  @Get(':id')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Get team by ID' })
  @ApiParam({ name: 'id', type: String })
  async getOne(@Param('id') id: string) {
    return ApiResponse.ok(await this.teams.findById(id));
  }

  @Post()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create team' })
  async create(@Body() dto: CreateTeamDto, @Request() req: any) {
    return ApiResponse.ok(await this.teams.create(dto, req.user.id));
  }

  @Put(':id')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update team' })
  @ApiParam({ name: 'id', type: String })
  async update(@Param('id') id: string, @Body() dto: UpdateTeamDto, @Request() req: any) {
    return ApiResponse.ok(await this.teams.update(id, dto, req.user.id));
  }

  @Delete(':id')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete team' })
  @ApiParam({ name: 'id', type: String })
  async delete(@Param('id') id: string, @Request() req: any) {
    await this.teams.delete(id, req.user.id);
    return ApiResponse.ok({ deleted: true });
  }

  @Post(':id/members')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add member to team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiBody({ schema: { properties: { userId: { type: 'string' }, tier: { type: 'string', enum: ['MEMBER', 'SENIOR', 'LEAD'] } } } })
  async addMember(
    @Param('id') teamId: string,
    @Body('userId') userId: string,
    @Body('tier') tier: TeamMemberTier = TeamMemberTier.MEMBER,
    @Request() req: any,
  ) {
    return ApiResponse.ok(await this.teams.addMember(teamId, userId, tier, req.user.id));
  }

  @Delete(':id/members/:userId')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async removeMember(@Param('id') teamId: string, @Param('userId') userId: string, @Request() req: any) {
    await this.teams.removeMember(teamId, userId, req.user.id);
    return ApiResponse.ok({ removed: true });
  }

  @Put(':id/members/:userId/tier')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Change member tier' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiBody({ schema: { properties: { tier: { type: 'string', enum: ['MEMBER', 'SENIOR', 'LEAD'] } } } })
  async changeTier(
    @Param('id') teamId: string,
    @Param('userId') userId: string,
    @Body('tier') tier: TeamMemberTier,
    @Request() req: any,
  ) {
    return ApiResponse.ok(await this.teams.changeTier(teamId, userId, tier, req.user.id));
  }
}

import { Controller, Get, Post, Put, Delete, Param, Query, Body, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { TeamsService, CreateTeamDto, UpdateTeamDto } from './teams.service';
import { UserRole, TeamMemberTier } from '@prisma/client';

@ApiTags('teams')
@Controller('v1/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List teams with pagination, search, and sorting' })
  async list(@Query() pagination: PaginationDto) {
    const { teams, total } = await this.teams.findAll({
      page: pagination.page,
      limit: pagination.limit,
      search: pagination.search,
      sortBy: pagination.sort,
      sortOrder: pagination.order,
    });
    return ApiResponse.paginated(teams, total, pagination.page, pagination.limit);
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

  // ── Policy attachment routes (effective MUST come before :policyId) ────────

  @Get(':id/policies/effective')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Get effective (highest priority active) policy for a team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  async getEffectivePolicy(@Param('id') teamId: string) {
    return ApiResponse.ok(await this.teams.getEffectivePolicy(teamId));
  }

  @Get(':id/policies')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'List policies attached to a team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  async getTeamPolicies(@Param('id') teamId: string) {
    return ApiResponse.ok(await this.teams.getTeamPolicies(teamId));
  }

  @Post(':id/policies/:policyId')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach a policy to a team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiParam({ name: 'policyId', description: 'Policy ID' })
  async attachPolicy(
    @Param('id') teamId: string,
    @Param('policyId') policyId: string,
    @Request() req: any,
  ) {
    return ApiResponse.ok(await this.teams.attachPolicy(teamId, policyId, req.user.id));
  }

  @Delete(':id/policies/:policyId')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Detach a policy from a team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiParam({ name: 'policyId', description: 'Policy ID' })
  async detachPolicy(
    @Param('id') teamId: string,
    @Param('policyId') policyId: string,
    @Request() req: any,
  ) {
    await this.teams.detachPolicy(teamId, policyId, req.user.id);
    return ApiResponse.ok({ detached: true });
  }
}

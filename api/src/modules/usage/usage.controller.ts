import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { UsageService } from './usage.service';

function parseDate(raw: string | undefined, name: string): Date {
  if (!raw) throw new BadRequestException(`Missing required query param: ${name}`);
  const d = new Date(raw);
  if (isNaN(d.getTime())) throw new BadRequestException(`Invalid date for ${name}: ${raw}`);
  return d;
}

@ApiTags('usage')
@Controller('v1/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @Auth(UserRole.IT_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Get usage for a specific user' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'groupBy', required: false, type: String })
  async getUserUsage(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return ApiResponse.ok(
      await this.usage.getUserUsage(userId, parseDate(from, 'from'), parseDate(to, 'to'), groupBy),
    );
  }

  @Get('summary')
  @Auth(UserRole.IT_ADMIN)
  @ApiOperation({ summary: 'Get org-wide usage summary' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  async getOrgSummary(@Query('from') from: string, @Query('to') to: string) {
    return ApiResponse.ok(
      await this.usage.getOrgSummary(parseDate(from, 'from'), parseDate(to, 'to')),
    );
  }

  @Get('teams/:id')
  @Auth(UserRole.IT_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Get usage for a specific team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  async getTeamUsage(
    @Param('id', ParseUUIDPipe) teamId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return ApiResponse.ok(
      await this.usage.getTeamUsage(teamId, parseDate(from, 'from'), parseDate(to, 'to')),
    );
  }
}

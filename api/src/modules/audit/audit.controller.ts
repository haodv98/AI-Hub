import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/response.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('v1/audit-logs')
@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
export class AuditController {
  private readonly allowedTargetTypes = new Set([
    'SYSTEM',
    'POLICY',
    'API_KEY',
    'USER',
    'TEAM',
  ]);

  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs with search and filters' })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'targetType', required: false, enum: ['SYSTEM', 'POLICY', 'API_KEY', 'USER', 'TEAM'] })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by user (targetId=userId)' })
  @ApiQuery({ name: 'teamId', required: false, type: String, description: 'Filter by team (targetId=teamId)' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date lower bound' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date upper bound' })
  async list(
    @Query() pagination: PaginationDto,
    @Query('q') q?: string,
    @Query('targetType') targetType?: string,
    @Query('userId') userId?: string,
    @Query('teamId') teamId?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
  ) {
    if (targetType && !this.allowedTargetTypes.has(targetType)) {
      throw new BadRequestException('targetType must be one of SYSTEM, POLICY, API_KEY, USER, TEAM');
    }

    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to   = toRaw   ? new Date(toRaw)   : undefined;
    if (from && isNaN(from.getTime())) throw new BadRequestException('Invalid date for from');
    if (to   && isNaN(to.getTime()))   throw new BadRequestException('Invalid date for to');

    const { rows, total } = await this.audit.listLogs({
      q, targetType, userId, teamId, from, to,
      page: pagination.page,
      limit: pagination.limit,
    });
    return ApiResponse.paginated(rows, total, pagination.page, pagination.limit);
  }
}

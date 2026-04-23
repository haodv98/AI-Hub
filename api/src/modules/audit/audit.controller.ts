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
  @ApiQuery({
    name: 'targetType',
    required: false,
    enum: ['SYSTEM', 'POLICY', 'API_KEY', 'USER', 'TEAM'],
  })
  async list(
    @Query() pagination: PaginationDto,
    @Query('q') q?: string,
    @Query('targetType') targetType?: string,
  ) {
    if (targetType && !this.allowedTargetTypes.has(targetType)) {
      throw new BadRequestException(
        'targetType must be one of SYSTEM, POLICY, API_KEY, USER, TEAM',
      );
    }

    const { rows, total } = await this.audit.listLogs({
      q,
      targetType,
      page: pagination.page,
      limit: pagination.limit,
    });
    return ApiResponse.paginated(rows, total, pagination.page, pagination.limit);
  }
}

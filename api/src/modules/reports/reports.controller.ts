import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('v1/reports')
@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List monthly reports' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(@Query('limit') limitRaw?: string) {
    const parsed = Number(limitRaw ?? 12);
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 24) : 12;
    return ApiResponse.ok(await this.reports.listMonthlyReports(limit));
  }

  @Get('preview/current-month')
  @ApiOperation({ summary: 'Get current month live report preview' })
  async getCurrentMonthPreview() {
    return ApiResponse.ok(await this.reports.getCurrentMonthPreview());
  }
}

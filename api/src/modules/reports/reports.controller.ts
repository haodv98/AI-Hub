import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('v1/reports')
@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List monthly reports with pagination' })
  async list(@Query() pagination: PaginationDto) {
    const { reports, total } = await this.reports.listMonthlyReports(pagination.page, pagination.limit);
    return ApiResponse.paginated(reports, total, pagination.page, pagination.limit);
  }

  @Get('preview/current-month')
  @ApiOperation({ summary: 'Get current month live report preview' })
  async getCurrentMonthPreview() {
    return ApiResponse.ok(await this.reports.getCurrentMonthPreview());
  }
}

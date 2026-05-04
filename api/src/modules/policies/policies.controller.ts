import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { PoliciesService } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { SimulatePolicyDto } from './dto/simulate-policy.dto';

@ApiTags('policies')
@Controller('v1/policies')
@Auth(UserRole.IT_ADMIN)
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Post()
  @ApiOperation({ summary: 'Create policy' })
  async create(@Body() dto: CreatePolicyDto) {
    return ApiResponse.ok(await this.policies.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'List policies with pagination, search, and filters' })
  @ApiQuery({ name: 'teamId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('teamId') teamId?: string,
    @Query('userId') userId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const { policies, total } = await this.policies.findAll({
      teamId,
      userId,
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
      search: pagination.search,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: pagination.sort,
      sortOrder: pagination.order,
    });
    return ApiResponse.paginated(policies, total, pagination.page, pagination.limit);
  }

  @Get('resolve')
  @ApiOperation({ summary: 'Resolve effective policy for a user' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  async resolve(@Query('userId', ParseUUIDPipe) userId: string) {
    return ApiResponse.ok(await this.policies.resolveEffectivePolicy(userId));
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate policy check for a user + model' })
  async simulate(@Body() dto: SimulatePolicyDto) {
    return ApiResponse.ok(
      await this.policies.simulate(dto.userId, dto.model, dto.currentCostUsd ?? 0),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get policy by ID' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return ApiResponse.ok(await this.policies.findById(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update policy' })
  @ApiParam({ name: 'id', type: String })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePolicyDto) {
    return ApiResponse.ok(await this.policies.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete policy' })
  @ApiParam({ name: 'id', type: String })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.policies.remove(id);
  }
}

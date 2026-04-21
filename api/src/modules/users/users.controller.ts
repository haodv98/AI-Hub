import { Controller, Get, Post, Put, Param, Body, Query, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiResponse } from '../../common/dto/response.dto';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { UserRole, UserStatus } from '@prisma/client';

@ApiTags('users')
@Controller('v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'teamId', required: false, type: String })
  async list(
    @Query() pagination: PaginationDto,
    @Query('status') status?: UserStatus,
    @Query('role') role?: UserRole,
    @Query('teamId') teamId?: string,
  ) {
    const { users, total } = await this.users.findAll({
      page: pagination.page,
      limit: pagination.limit,
      status,
      role,
      teamId,
    });
    return ApiResponse.paginated(users, total, pagination.page, pagination.limit);
  }

  @Get(':id')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: String })
  async getOne(@Param('id') id: string) {
    return ApiResponse.ok(await this.users.findById(id));
  }

  @Post()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create user' })
  async create(@Body() dto: CreateUserDto, @Request() req: any) {
    return ApiResponse.ok(await this.users.create(dto, req.user.id));
  }

  @Put(':id')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'id', type: String })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Request() req: any) {
    return ApiResponse.ok(await this.users.update(id, dto, req.user.id));
  }

  @Post(':id/offboard')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Offboard user (revoke keys, deactivate)' })
  @ApiParam({ name: 'id', type: String })
  async offboard(@Param('id') id: string, @Request() req: any) {
    return ApiResponse.ok(await this.users.offboard(id, req.user.id));
  }
}

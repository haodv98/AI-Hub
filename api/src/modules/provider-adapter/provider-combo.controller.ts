import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AliasScope, ComboStrategy, UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';

class CreateComboDto {
  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  models: string[];

  @IsEnum(ComboStrategy)
  strategy: ComboStrategy;

  @IsInt() @Min(1) @IsOptional()
  @Type(() => Number)
  stickyLimit?: number;

  @IsEnum(AliasScope) @IsOptional()
  scope?: AliasScope;

  @IsString() @IsOptional()
  scopeId?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

class UpdateComboDto {
  @IsArray() @IsString({ each: true }) @IsOptional()
  models?: string[];

  @IsEnum(ComboStrategy) @IsOptional()
  strategy?: ComboStrategy;

  @IsInt() @Min(1) @IsOptional()
  @Type(() => Number)
  stickyLimit?: number;

  @IsEnum(AliasScope) @IsOptional()
  scope?: AliasScope;

  @IsString() @IsOptional()
  scopeId?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

@ApiTags('admin/combos')
@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/combos')
export class ProviderComboController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @ApiOperation({ summary: 'Create provider combo' })
  async create(@Body() dto: CreateComboDto) {
    try {
      const combo = await this.prisma.providerCombo.create({
        data: {
          name: dto.name,
          models: dto.models,
          strategy: dto.strategy,
          stickyLimit: dto.stickyLimit ?? 10,
          scope: dto.scope ?? AliasScope.ORG,
          scopeId: dto.scopeId,
          isActive: dto.isActive ?? true,
        },
      });
      return ApiResponse.ok(combo);
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') throw new ConflictException(`Combo name "${dto.name}" already exists`);
      throw err;
    }
  }

  @Get()
  @ApiOperation({ summary: 'List provider combos' })
  async findAll(@Query() pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await Promise.all([
      this.prisma.providerCombo.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.providerCombo.count(),
    ]);
    return ApiResponse.paginated(items, total, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get provider combo by id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const combo = await this.prisma.providerCombo.findUnique({ where: { id } });
    if (!combo) throw new NotFoundException(`Combo ${id} not found`);
    return ApiResponse.ok(combo);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update provider combo' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComboDto) {
    const existing = await this.prisma.providerCombo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Combo ${id} not found`);

    const combo = await this.prisma.providerCombo.update({
      where: { id },
      data: {
        ...(dto.models !== undefined ? { models: dto.models } : {}),
        ...(dto.strategy !== undefined ? { strategy: dto.strategy } : {}),
        ...(dto.stickyLimit !== undefined ? { stickyLimit: dto.stickyLimit } : {}),
        ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
        ...(dto.scopeId !== undefined ? { scopeId: dto.scopeId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return ApiResponse.ok(combo);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete provider combo' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const existing = await this.prisma.providerCombo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Combo ${id} not found`);
    await this.prisma.providerCombo.delete({ where: { id } });
    return ApiResponse.ok({ deleted: true });
  }
}

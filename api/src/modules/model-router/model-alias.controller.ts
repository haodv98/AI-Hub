import {
  Body,
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
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelAliasService } from './model-alias.service';

enum AliasScope {
  ORG = 'ORG',
  TEAM = 'TEAM',
  KEY = 'KEY',
}

class CreateAliasDto {
  @IsEnum(AliasScope)
  scope: AliasScope;

  @IsString() @IsOptional()
  scopeId?: string;

  @IsString() @MaxLength(255)
  fromPattern: string;

  @IsString() @MaxLength(255)
  toProviderModel: string;

  @IsInt() @Min(0) @IsOptional()
  @Type(() => Number)
  priority?: number;

  @IsString() @IsOptional()
  description?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

class UpdateAliasDto {
  @IsString() @MaxLength(255) @IsOptional()
  fromPattern?: string;

  @IsString() @MaxLength(255) @IsOptional()
  toProviderModel?: string;

  @IsInt() @Min(0) @IsOptional()
  @Type(() => Number)
  priority?: number;

  @IsString() @IsOptional()
  description?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

class ListAliasesDto extends PaginationDto {
  @IsEnum(AliasScope) @IsOptional()
  scope?: AliasScope;

  @IsString() @IsOptional()
  scopeId?: string;
}

@ApiTags('admin/aliases')
@Controller('admin/aliases')
@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
export class ModelAliasController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: ModelAliasService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create model alias' })
  async create(@Body() dto: CreateAliasDto) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alias = await (this.prisma as any).modelAlias.create({
      data: {
        scope: dto.scope,
        scopeId: dto.scopeId ?? null,
        fromPattern: dto.fromPattern,
        toProviderModel: dto.toProviderModel,
        priority: dto.priority ?? 100,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.aliasService.invalidateCache(dto.scope, dto.scopeId ?? null);
    return ApiResponse.ok(alias);
  }

  @Get()
  @ApiOperation({ summary: 'List model aliases' })
  async list(@Query() query: ListAliasesDto) {
    const where = {
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.scopeId !== undefined ? { scopeId: query.scopeId } : {}),
      ...(query.search ? { fromPattern: { contains: query.search } } : {}),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [aliases, total] = await (this.prisma as any).$transaction([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.prisma as any).modelAlias.findMany({
        where,
        orderBy: query.orderBy('priority'),
        skip: query.skip,
        take: query.take,
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.prisma as any).modelAlias.count({ where }),
    ]);
    return ApiResponse.paginated(aliases, total, query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get model alias by id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alias = await (this.prisma as any).modelAlias.findUnique({ where: { id } });
    if (!alias) throw new NotFoundException(`Alias ${id} not found`);
    return ApiResponse.ok(alias);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update model alias' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAliasDto) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (this.prisma as any).modelAlias.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Alias ${id} not found`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (this.prisma as any).modelAlias.update({
      where: { id },
      data: {
        ...(dto.fromPattern !== undefined ? { fromPattern: dto.fromPattern } : {}),
        ...(dto.toProviderModel !== undefined ? { toProviderModel: dto.toProviderModel } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.aliasService.invalidateCache(existing.scope, existing.scopeId);
    return ApiResponse.ok(updated);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete model alias' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (this.prisma as any).modelAlias.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Alias ${id} not found`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.prisma as any).modelAlias.delete({ where: { id } });
    await this.aliasService.invalidateCache(existing.scope, existing.scopeId);
    return ApiResponse.ok({ deleted: true });
  }
}

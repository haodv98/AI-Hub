import { IsInt, IsOptional, IsString, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsInt() @Min(1) @IsOptional()
  @Type(() => Number)
  page: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsInt() @Min(1) @Max(100) @IsOptional()
  @Type(() => Number)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Search keyword' })
  @IsString() @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field name', example: 'createdAt' })
  @IsString() @IsOptional()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsIn(['asc', 'desc']) @IsOptional()
  order: 'asc' | 'desc' = 'desc';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get take(): number {
    return this.limit;
  }

  orderBy(defaultField = 'createdAt'): Record<string, 'asc' | 'desc'> {
    return { [this.sort ?? defaultField]: this.order };
  }
}

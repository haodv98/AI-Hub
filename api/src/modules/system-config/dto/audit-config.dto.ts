import { IsString, IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAuditConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsIn(['INFO', 'ERROR', 'DEBUG']) loggingVerbosity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() retentionPolicy?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mirroring?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() globalAlerting?: boolean;
}

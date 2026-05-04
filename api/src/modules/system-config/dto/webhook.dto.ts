import { IsString, IsUrl, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWebhookDto {
  @ApiProperty() @IsUrl() url!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() secret?: string;
  @ApiProperty() @IsArray() @IsString({ each: true }) events!: string[];
}

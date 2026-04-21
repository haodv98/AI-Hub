import { IsUUID, IsString, IsNotEmpty, IsNumber, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SimulatePolicyDto {
  @ApiProperty({ description: 'User ID to simulate policy for' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'claude-sonnet-4-6' })
  @IsString()
  @IsNotEmpty()
  model: string;

  @ApiPropertyOptional({ example: 15.5, description: 'Current spend this month in USD' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  currentCostUsd?: number;
}

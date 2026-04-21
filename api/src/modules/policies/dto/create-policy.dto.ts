import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  IsObject,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TeamMemberTier } from '@prisma/client';
import { PolicyConfig } from '../policies.types';

export class CreatePolicyDto {
  @ApiProperty({ example: 'Backend Team Policy' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Enhanced limits for backend engineers' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Team this policy applies to (null = org-wide)' })
  @IsUUID()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({ enum: TeamMemberTier, description: 'Role tier (null = all roles in team)' })
  @IsEnum(TeamMemberTier)
  @IsOptional()
  tier?: TeamMemberTier;

  @ApiPropertyOptional({ description: 'User ID for individual override policy' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ example: 10, description: 'Higher priority wins. 0 = lowest.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['claude-sonnet-4-6', 'gpt-4o'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedEngines?: string[];

  @ApiPropertyOptional({ description: 'Policy config: limits (rpm, dailyTokens, monthlyBudgetUsd) + fallback' })
  @IsObject()
  @IsOptional()
  config?: PolicyConfig;
}

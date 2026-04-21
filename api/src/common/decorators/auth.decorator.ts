import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

export function Auth(...roles: UserRole[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    ...(roles.length ? [Roles(...roles)] : []),
    ApiBearerAuth('jwt'),
    ApiUnauthorizedResponse({ description: 'Missing or invalid token' }),
    ApiForbiddenResponse({ description: 'Insufficient role' }),
  );
}

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('No user context');
    }

    // Keycloak roles are lowercase (e.g. 'it_admin'), Prisma enum is uppercase
    const userRoles: string[] = user.roles || [];
    const hasRole = requiredRoles.some((role) =>
      userRoles.includes(role.toLowerCase()) ||
      userRoles.includes(role)
    );

    if (!hasRole) {
      throw new ForbiddenException(`Requires role: ${requiredRoles.join(' or ')}`);
    }

    return true;
  }
}

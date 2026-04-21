import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import { KeysService } from '../../keys/keys.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly keys: KeysService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractKey(req);

    if (!token) {
      throw new UnauthorizedException('API key required');
    }

    const apiKey = await this.keys.validateKey(token);
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Load user context
    const user = await this.prisma.user.findUnique({
      where: { id: apiKey.userId },
      include: { teamMembers: { where: { isPrimary: true }, include: { team: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive');
    }

    req['user'] = {
      id: user.id,
      email: user.email,
      apiKeyId: apiKey.id,
      teamId: user.teamMembers[0]?.teamId || null,
      tier: user.teamMembers[0]?.tier || 'MEMBER',
      roles: [user.role.toLowerCase()],
    };

    return true;
  }

  private extractKey(req: Request): string | null {
    // Standard Bearer token
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);

    // OpenAI-compatible: x-api-key header
    const xApiKey = req.headers['x-api-key'];
    if (xApiKey) return xApiKey as string;

    return null;
  }
}

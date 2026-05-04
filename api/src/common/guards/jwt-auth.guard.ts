import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';

interface KeycloakTokenPayload {
  sub?: string;
  email?: string;
  realm_access?: { roles: string[] };
  preferred_username?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwksCache: { keys: any[]; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const payload = await this.validateToken(token);
    const appUser = await this.resolveAppUser(payload);
    req['user'] = {
      id: appUser.id,
      email: appUser.email,
      roles: payload.realm_access?.roles || [],
    };

    return true;
  }

  /**
   * Keycloak `sub` is often not the same UUID as `users.id` in AIHub.
   * Resolve the app user by id first, then by email / preferred_username.
   */
  private async resolveAppUser(payload: KeycloakTokenPayload): Promise<{ id: string; email: string }> {
    const sub = typeof payload.sub === 'string' && payload.sub.trim().length > 0 ? payload.sub.trim() : undefined;
    const emailClaim =
      typeof payload.email === 'string' && payload.email.trim().length > 0
        ? payload.email.trim().toLowerCase()
        : undefined;
    const preferred =
      typeof payload.preferred_username === 'string' && payload.preferred_username.includes('@')
        ? payload.preferred_username.trim().toLowerCase()
        : undefined;
    const emailLookup = emailClaim ?? preferred;

    if (sub) {
      const byId = await this.prisma.user.findUnique({
        where: { id: sub },
        select: { id: true, email: true },
      });
      if (byId) {
        return byId;
      }
    }

    if (emailLookup) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: emailLookup },
        select: { id: true, email: true },
      });
      if (byEmail) {
        return byEmail;
      }
    }

    this.logger.warn(
      `JWT accepted but no AIHub user: sub=${sub ?? 'empty'} emailClaim=${emailClaim ?? 'empty'}`,
    );
    // 403 — identity is known but not registered; avoids SPA loops that treat 401 as "re-login"
    throw new ForbiddenException(
      'No AIHub user matches this token. Use an email that exists in AIHub, or ask IT to link your Keycloak account.',
    );
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  }

  private async validateToken(token: string): Promise<KeycloakTokenPayload> {
    // Decode header to get kid
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    // Fetch JWKS from Keycloak (cached 10 min)
    const jwks = await this.getJwks();
    const key = jwks.find((k: any) => k.kid === header.kid);

    if (!key) {
      throw new UnauthorizedException('Token signing key not found');
    }

    // Verify signature using Node.js crypto (RS256)
    const [, payloadB64, signatureB64] = token.split('.');
    const data = `${headerB64}.${payloadB64}`;
    const signature = Buffer.from(signatureB64, 'base64url');

    const publicKey = crypto.createPublicKey({
      key: { kty: key.kty, n: key.n, e: key.e },
      format: 'jwk',
    });

    const valid = crypto.verify('sha256', Buffer.from(data), publicKey, signature);
    if (!valid) {
      throw new UnauthorizedException('Invalid token signature');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Validate expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    return payload;
  }

  private async getJwks(): Promise<any[]> {
    if (this.jwksCache && this.jwksCache.expiresAt > Date.now()) {
      return this.jwksCache.keys;
    }

    const keycloakUrl = this.config.get('KEYCLOAK_URL', 'http://localhost:8080');
    const realm = this.config.get('KEYCLOAK_REALM', 'aihub');
    const url = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`;

    const { data } = await axios.get(url, { timeout: 5000 });
    this.jwksCache = { keys: data.keys, expiresAt: Date.now() + 10 * 60 * 1000 };

    return data.keys;
  }
}

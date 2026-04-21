import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import axios from 'axios';

interface KeycloakTokenPayload {
  sub: string;
  email: string;
  realm_access?: { roles: string[] };
  preferred_username?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwksCache: { keys: any[]; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const payload = await this.validateToken(token);
    req['user'] = {
      id: payload.sub,
      email: payload.email,
      roles: payload.realm_access?.roles || [],
    };

    return true;
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

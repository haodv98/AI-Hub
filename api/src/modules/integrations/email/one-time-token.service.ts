import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { OneTimeTokenPayload } from './email.types';
import { ConfigService } from '@nestjs/config';

const TOKEN_PREFIX = 'email:onetime:';
const MAX_COLLISION_RETRIES = 3;

@Injectable()
export class OneTimeTokenService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async issue(input: {
    subject: string;
    purpose: 'key_reveal';
    resourceId: string;
    ttlHours: number;
    keyPlaintext?: string;
  }): Promise<string> {
    const ttlSeconds = Math.floor(input.ttlHours * 3600);
    if (ttlSeconds <= 0) {
      throw new Error('Token TTL must be greater than 0');
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const payload: OneTimeTokenPayload = {
      subject: input.subject,
      purpose: input.purpose,
      resourceId: input.resourceId,
      expiresAt,
      keyPlaintext: input.keyPlaintext
        ? this.encryptKeyPlaintext(input.keyPlaintext)
        : undefined,
    };

    for (let attempt = 0; attempt <= MAX_COLLISION_RETRIES; attempt += 1) {
      const token = crypto.randomBytes(24).toString('base64url');
      const created = await this.redis.setNx(
        `${TOKEN_PREFIX}${token}`,
        JSON.stringify(payload),
        ttlSeconds,
      );
      if (created) return token;
    }

    throw new Error('Failed to issue one-time token after retries');
  }

  async consume(
    token: string,
    purpose: OneTimeTokenPayload['purpose'],
  ): Promise<OneTimeTokenPayload | null> {
    if (!token || token.length < 16) return null;

    const raw = await this.redis.getDel(`${TOKEN_PREFIX}${token}`);
    if (!raw) return null;

    try {
      const payload = JSON.parse(raw) as OneTimeTokenPayload;
      if (payload.purpose !== purpose) return null;
      if (new Date(payload.expiresAt).getTime() <= Date.now()) return null;
      if (payload.keyPlaintext) {
        payload.keyPlaintext = this.decryptKeyPlaintext(payload.keyPlaintext);
      }
      return payload;
    } catch {
      return null;
    }
  }

  private encryptKeyPlaintext(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decryptKeyPlaintext(encoded: string): string {
    const key = this.getEncryptionKey();
    const [ivB64, tagB64, encryptedB64] = encoded.split('.');
    if (!ivB64 || !tagB64 || !encryptedB64) {
      throw new Error('Malformed encrypted key payload');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const raw = this.config.get<string>('CLAIM_TOKEN_ENCRYPTION_KEY');
    if (!raw) {
      throw new Error('Missing CLAIM_TOKEN_ENCRYPTION_KEY');
    }
    const digest = crypto.createHash('sha256').update(raw).digest();
    return digest;
  }
}

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as NodeVault from 'node-vault';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class VaultService implements OnModuleInit {
  private readonly logger = new Logger(VaultService.name);
  private vault: NodeVault.client;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const addr = this.config.get<string>('VAULT_ADDR', 'http://localhost:8200');

    this.vault = NodeVault({ endpoint: addr });

    // Authenticate: prefer AppRole in production, token in dev
    const token = this.config.get<string>('VAULT_TOKEN');
    const roleId = this.config.get<string>('VAULT_ROLE_ID');
    const secretId = this.config.get<string>('VAULT_SECRET_ID');

    if (token) {
      this.vault.token = token;
      this.logger.log('Vault authenticated via root token (dev mode)');
    } else if (roleId && secretId) {
      const result = await this.vault.approleLogin({ role_id: roleId, secret_id: secretId });
      this.vault.token = result.auth.client_token;
      this.logger.log('Vault authenticated via AppRole');

      // Schedule token renewal before TTL
      const ttlMs = result.auth.lease_duration * 1000 * 0.8;
      setTimeout(() => this.renewToken(roleId, secretId), ttlMs);
    } else {
      throw new Error('Vault credentials not configured. Set VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID');
    }
  }

  async getProviderKey(provider: 'anthropic' | 'openai' | 'google'): Promise<string> {
    const path = `secret/aihub/providers/${provider}`;
    return this.readSecret(path, 'api_key');
  }

  async readSecret(path: string, field: string): Promise<string> {
    const cacheKey = `${path}:${field}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const result = await this.vault.read(path);
    const value = result.data?.data?.[field] ?? result.data?.[field];

    if (!value) {
      throw new Error(`Secret not found: ${path}#${field}`);
    }

    this.cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  private async renewToken(roleId: string, secretId: string) {
    try {
      const result = await this.vault.approleLogin({ role_id: roleId, secret_id: secretId });
      this.vault.token = result.auth.client_token;
      this.logger.log('Vault token renewed');

      const ttlMs = result.auth.lease_duration * 1000 * 0.8;
      setTimeout(() => this.renewToken(roleId, secretId), ttlMs);
    } catch (err) {
      this.logger.error('Vault token renewal failed — using cached keys', err);
    }
  }
}

import { BadGatewayException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

    this.logger.log(`Vault KV engine mount for aihub paths: "${this.kvMount()}" (override with VAULT_KV_MOUNT)`);
  }

  async getProviderKey(provider: 'anthropic' | 'openai' | 'google'): Promise<string> {
    const path = `kv/aihub/providers/${provider}/shared`;
    return this.readSecret(path, 'api_key');
  }

  async writeSecret(path: string, data: Record<string, unknown>): Promise<void> {
    const resolvedPath = this.resolveKvV2Path(path);
    const isKvV2Path = this.isKvV2AihubPath(path);
    try {
      if (isKvV2Path) {
        await this.vault.write(resolvedPath, { data });
      } else {
        await this.vault.write(resolvedPath, data);
      }
    } catch (err: unknown) {
      this.maybeThrowVaultRouteHelp(err, path, resolvedPath, 'write');
      throw err;
    }

    for (const field of Object.keys(data)) {
      this.cache.delete(`${path}:${field}`);
    }
  }

  async readSecret(path: string, field: string): Promise<string> {
    const cacheKey = `${path}:${field}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    let result: unknown;
    try {
      result = await this.vault.read(this.resolveKvV2Path(path));
    } catch (err: unknown) {
      const resolved = this.resolveKvV2Path(path);
      this.maybeThrowVaultRouteHelp(err, path, resolved, 'read');
      throw err;
    }
    const envelope = result as { data?: { data?: Record<string, unknown> } & Record<string, unknown> };
    const raw = envelope.data?.data?.[field] ?? envelope.data?.[field];
    const value = typeof raw === 'string' ? raw : raw != null ? String(raw) : '';

    if (!value) {
      throw new Error(`Secret not found: ${path}#${field}`);
    }

    this.cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** KV secrets engine mount (path prefix), without trailing slash. Default matches `infra/vault/init.sh`. */
  private kvMount(): string {
    return (this.config.get<string>('VAULT_KV_MOUNT') ?? 'kv').replace(/\/$/, '');
  }

  /**
   * DB and services store the logical prefix `kv/...`. Remap to the real mount
   * when operators use e.g. `secret/` (older docs) or a non-default engine path.
   */
  private remountLogicalPath(path: string): string {
    if (path.startsWith('kv/')) {
      return `${this.kvMount()}/${path.slice('kv/'.length)}`;
    }
    return path;
  }

  private isKvV2AihubPath(logicalPath: string): boolean {
    const p = this.remountLogicalPath(logicalPath);
    return p.startsWith(`${this.kvMount()}/`);
  }

  private resolveKvV2Path(path: string): string {
    const p = this.remountLogicalPath(path);
    const mount = this.kvMount();
    if (!p.startsWith(`${mount}/`)) return p;
    if (p.startsWith(`${mount}/data/`)) return p;
    return `${mount}/data/${p.slice(mount.length + 1)}`;
  }

  /** If Vault returns "no handler for route", throw HTTP 502 with remediation; otherwise no-op. */
  private maybeThrowVaultRouteHelp(
    err: unknown,
    logicalPath: string,
    resolvedPath: string,
    op: 'read' | 'write',
  ): void {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/no handler for route|route entry not found/i.test(msg)) {
      return;
    }
    const mount = this.kvMount();
    throw new BadGatewayException(
      `Vault ${op} failed: no route for "${resolvedPath}". ` +
        `Ensure KV secrets engine v2 is enabled at mount "${mount}" (e.g. \`vault secrets enable -path=${mount} kv-v2\`) ` +
        `or set VAULT_KV_MOUNT to your mount name. For local dev run \`bash infra/vault/init.sh\`. ` +
        `App logical path: ${logicalPath}. Vault: ${msg}`,
    );
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

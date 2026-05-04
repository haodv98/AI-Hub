import * as net from 'net';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSmtpDto } from './dto/smtp.dto';
import { UpdateWebhookDto } from './dto/webhook.dto';
import { UpdateAuditConfigDto } from './dto/audit-config.dto';

export interface SmtpConfig {
  server: string;
  port: string;
  user: string;
  encryption: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
}

export interface AuditConfig {
  loggingVerbosity: string;
  retentionPolicy: string;
  mirroring: boolean;
  globalAlerting: boolean;
}

const SMTP_DEFAULTS: SmtpConfig = { server: '', port: '587', user: '', encryption: 'TLS' };
const WEBHOOK_DEFAULTS: WebhookConfig = { url: '', secret: '', events: [] };
const AUDIT_DEFAULTS: AuditConfig = {
  loggingVerbosity: 'INFO',
  retentionPolicy: '30d',
  mirroring: false,
  globalAlerting: true,
};

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSmtp(): Promise<SmtpConfig> {
    return this.getConfig('smtp', SMTP_DEFAULTS);
  }

  async updateSmtp(dto: UpdateSmtpDto): Promise<SmtpConfig> {
    const current = await this.getSmtp();
    const updated: SmtpConfig = {
      server: dto.server,
      port: dto.port,
      user: dto.user,
      encryption: dto.encryption,
    };
    // Only update password if explicitly provided
    if (dto.password) {
      Object.assign(updated, { password: dto.password });
    } else if ('password' in current) {
      Object.assign(updated, { password: (current as SmtpConfig & { password?: string }).password });
    }
    return this.setConfig('smtp', updated);
  }

  async testSmtp(): Promise<{ ok: boolean; latencyMs: number }> {
    const smtp = await this.getSmtp();
    const start = Date.now();
    try {
      await this.tcpProbe(smtp.server, Number(smtp.port));
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP test failed: ${message}`);
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  private tcpProbe(host: string, port: number, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`TCP probe timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(); });
      socket.once('error', (err) => { clearTimeout(timer); reject(err); });
    });
  }

  async getWebhooks(): Promise<WebhookConfig> {
    return this.getConfig('webhooks', WEBHOOK_DEFAULTS);
  }

  async updateWebhooks(dto: UpdateWebhookDto): Promise<WebhookConfig> {
    return this.setConfig('webhooks', { url: dto.url, secret: dto.secret ?? '', events: dto.events });
  }

  async getAuditConfig(): Promise<AuditConfig> {
    return this.getConfig('audit', AUDIT_DEFAULTS);
  }

  async updateAuditConfig(dto: UpdateAuditConfigDto): Promise<AuditConfig> {
    const current = await this.getAuditConfig();
    return this.setConfig('audit', { ...current, ...dto });
  }

  private async getConfig<T>(key: string, defaults: T): Promise<T> {
    const row = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (!row) return defaults;
    return { ...defaults, ...(row.value as Record<string, unknown>) } as T;
  }

  private async setConfig<T>(key: string, value: T): Promise<T> {
    const jsonValue = value as unknown as Prisma.InputJsonValue;
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value: jsonValue },
      update: { value: jsonValue },
    });
    return value;
  }
}

import { Injectable } from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  private readonly gatewayRequestsTotal: Counter<string>;
  private readonly gatewayLatencyMs: Histogram<string>;
  private readonly budgetUsagePct: Gauge<string>;
  private readonly activeKeysTotal: Gauge<string>;
  private readonly rateLimitRejectionsTotal: Counter<string>;

  constructor(private readonly prisma: PrismaService) {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: 'aihub_' });

    this.gatewayRequestsTotal = new Counter({
      name: 'aihub_gateway_requests_total',
      help: 'Total gateway requests by provider, model, and status',
      labelNames: ['provider', 'model', 'status'],
      registers: [this.registry],
    });

    this.gatewayLatencyMs = new Histogram({
      name: 'aihub_gateway_latency_ms',
      help: 'Gateway request latency in milliseconds by provider',
      labelNames: ['provider'],
      buckets: [50, 100, 200, 500, 1000],
      registers: [this.registry],
    });

    this.budgetUsagePct = new Gauge({
      name: 'aihub_budget_usage_pct',
      help: 'Current monthly budget usage percentage by team',
      labelNames: ['team'],
      registers: [this.registry],
    });

    this.activeKeysTotal = new Gauge({
      name: 'aihub_active_keys_total',
      help: 'Current API key totals grouped by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.rateLimitRejectionsTotal = new Counter({
      name: 'aihub_rate_limit_rejections_total',
      help: 'Rate limit rejections grouped by user tier',
      labelNames: ['user_tier'],
      registers: [this.registry],
    });
  }

  recordGatewayRequest(provider: string, model: string, status: 'success' | 'error'): void {
    this.gatewayRequestsTotal.inc({ provider, model, status });
  }

  observeGatewayLatency(provider: string, latencyMs: number): void {
    this.gatewayLatencyMs.observe({ provider }, Math.max(0, latencyMs));
  }

  setTeamBudgetUsage(teamId: string, usagePct: number): void {
    this.budgetUsagePct.set({ team: teamId }, Math.max(0, usagePct));
  }

  recordRateLimitRejection(userTier: string): void {
    this.rateLimitRejectionsTotal.inc({ user_tier: userTier.toLowerCase() });
  }

  async metrics(): Promise<string> {
    await this.refreshActiveKeysTotal();
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }

  private async refreshActiveKeysTotal(): Promise<void> {
    const grouped = await this.prisma.apiKey.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const knownStatuses: ApiKeyStatus[] = [
      ApiKeyStatus.ACTIVE,
      ApiKeyStatus.ROTATING,
      ApiKeyStatus.REVOKED,
      ApiKeyStatus.EXPIRED,
    ];
    const groupedMap = new Map<ApiKeyStatus, number>(
      grouped.map((row) => [row.status, row._count.status]),
    );

    for (const status of knownStatuses) {
      this.activeKeysTotal.set({ status: status.toLowerCase() }, groupedMap.get(status) ?? 0);
    }
  }
}

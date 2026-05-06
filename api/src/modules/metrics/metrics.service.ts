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

const LATENCY_BUCKETS_S = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  private readonly gatewayRequestsTotal: Counter<string>;
  private readonly gatewayLatencyMs: Histogram<string>;
  private readonly budgetUsagePct: Gauge<string>;
  private readonly activeKeysTotal: Gauge<string>;
  private readonly rateLimitRejectionsTotal: Counter<string>;

  // Provider adapter layer
  private readonly aliasResolutionTotal: Counter<string>;
  private readonly aliasResolutionDurationS: Histogram<string>;
  private readonly adapterForwardTotal: Counter<string>;
  private readonly adapterForwardDurationS: Histogram<string>;
  private readonly comboAttemptTotal: Counter<string>;
  private readonly comboFallbackTotal: Counter<string>;
  private readonly formatTranslationTotal: Counter<string>;

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

    this.aliasResolutionTotal = new Counter({
      name: 'aihub_alias_resolution_total',
      help: 'Total alias resolutions by alias pattern, resolved provider, matched scope, and status',
      labelNames: ['alias', 'resolved_provider', 'matched_scope', 'status'],
      registers: [this.registry],
    });

    this.aliasResolutionDurationS = new Histogram({
      name: 'aihub_alias_resolution_duration_seconds',
      help: 'Alias resolution latency in seconds',
      labelNames: ['alias'],
      buckets: LATENCY_BUCKETS_S,
      registers: [this.registry],
    });

    this.adapterForwardTotal = new Counter({
      name: 'aihub_adapter_forward_total',
      help: 'Total adapter forward calls by provider, model, and status',
      labelNames: ['provider', 'model', 'status'],
      registers: [this.registry],
    });

    this.adapterForwardDurationS = new Histogram({
      name: 'aihub_adapter_forward_duration_seconds',
      help: 'Adapter forward latency in seconds by provider and model',
      labelNames: ['provider', 'model'],
      buckets: LATENCY_BUCKETS_S,
      registers: [this.registry],
    });

    this.comboAttemptTotal = new Counter({
      name: 'aihub_combo_attempt_total',
      help: 'Total combo forward attempts by combo name, model, hop index, and status',
      labelNames: ['combo', 'model', 'hop', 'status'],
      registers: [this.registry],
    });

    this.comboFallbackTotal = new Counter({
      name: 'aihub_combo_fallback_total',
      help: 'Total combo fallbacks triggered (move to next model after retryable failure)',
      labelNames: ['combo'],
      registers: [this.registry],
    });

    this.formatTranslationTotal = new Counter({
      name: 'aihub_format_translation_total',
      help: 'Total format translations by source and target format',
      labelNames: ['from_format', 'to_format'],
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

  recordAliasResolution(alias: string, resolvedProvider: string, matchedScope: string, status: 'success' | 'error'): void {
    this.aliasResolutionTotal.inc({ alias, resolved_provider: resolvedProvider, matched_scope: matchedScope, status });
  }

  observeAliasResolutionDuration(alias: string, durationSec: number): void {
    this.aliasResolutionDurationS.observe({ alias }, Math.max(0, durationSec));
  }

  recordAdapterForward(provider: string, model: string, status: 'success' | 'error'): void {
    this.adapterForwardTotal.inc({ provider, model, status });
  }

  observeAdapterForwardDuration(provider: string, model: string, durationSec: number): void {
    this.adapterForwardDurationS.observe({ provider, model }, Math.max(0, durationSec));
  }

  recordComboAttempt(combo: string, model: string, hop: number, status: 'success' | 'error'): void {
    this.comboAttemptTotal.inc({ combo, model, hop: String(hop), status });
  }

  recordComboFallback(combo: string): void {
    this.comboFallbackTotal.inc({ combo });
  }

  recordFormatTranslation(fromFormat: string, toFormat: string): void {
    this.formatTranslationTotal.inc({ from_format: fromFormat, to_format: toFormat });
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

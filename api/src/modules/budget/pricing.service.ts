import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface ModelPricing {
  provider: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private models: Record<string, ModelPricing> = {};

  onModuleInit() {
    this.loadPricing();
  }

  private loadPricing() {
    const pricingPath = join(process.cwd(), 'config', 'pricing.yaml');
    const content = readFileSync(pricingPath, 'utf-8');
    const config = parse(content);
    this.models = config.models || {};
    this.logger.log(`Loaded pricing for ${Object.keys(this.models).length} models`);
  }

  estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.models[model];
    if (!pricing) {
      this.logger.warn(`No pricing found for model: ${model}, using default`);
      return (inputTokens + outputTokens) * 0.000003; // fallback ~$3/M
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
    return inputCost + outputCost;
  }

  getProviderForModel(model: string): string {
    return this.models[model]?.provider || 'unknown';
  }

  getSupportedModels(): string[] {
    return Object.keys(this.models);
  }
}

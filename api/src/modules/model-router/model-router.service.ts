import { Injectable } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { ModelAliasService } from './model-alias.service';
import { ResolveContext, ResolveResult, ParsedProviderModel } from './model-router.types';

@Injectable()
export class ModelRouterService {
  constructor(
    private readonly modelAliasService: ModelAliasService,
    private readonly metrics: MetricsService,
  ) {}

  async resolveAlias(model: string, ctx: ResolveContext): Promise<ResolveResult> {
    const start = Date.now();
    try {
      const result = await this.modelAliasService.resolveAlias(model, ctx);
      const resolvedProvider = result.isPassthrough ? 'passthrough' : result.providerModel.split('/')[0];
      const matchedScope = result.matchedAlias?.scope ?? 'passthrough';
      this.metrics.recordAliasResolution(model, resolvedProvider, matchedScope, 'success');
      return result;
    } catch (err: unknown) {
      this.metrics.recordAliasResolution(model, 'none', 'none', 'error');
      throw err;
    } finally {
      this.metrics.observeAliasResolutionDuration(model, (Date.now() - start) / 1000);
    }
  }

  parseProviderModel(input: string): ParsedProviderModel {
    const slashIdx = input.indexOf('/');
    if (slashIdx === -1) {
      throw new Error(`Invalid provider/model format: "${input}"`);
    }
    return {
      provider: input.slice(0, slashIdx),
      modelId: input.slice(slashIdx + 1),
    };
  }
}

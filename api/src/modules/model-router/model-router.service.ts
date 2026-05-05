import { Injectable } from '@nestjs/common';
import { ModelAliasService } from './model-alias.service';
import { ResolveContext, ResolveResult, ParsedProviderModel } from './model-router.types';

@Injectable()
export class ModelRouterService {
  constructor(private readonly modelAliasService: ModelAliasService) {}

  async resolveAlias(model: string, ctx: ResolveContext): Promise<ResolveResult> {
    return this.modelAliasService.resolveAlias(model, ctx);
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

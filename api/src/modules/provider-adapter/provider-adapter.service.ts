import { Injectable } from '@nestjs/common';
import { FormatTranslatorService } from '../format-translator/format-translator.service';
import { MetricsService } from '../metrics/metrics.service';
import { ProviderAdapterRegistry } from './provider-adapter.registry';
import { AdapterForwardResult } from './provider-adapter.interface';

@Injectable()
export class ProviderAdapterService {
  constructor(
    private readonly registry: ProviderAdapterRegistry,
    private readonly translator: FormatTranslatorService,
    private readonly metrics: MetricsService,
  ) {}

  async forward(
    resolvedModel: string,
    requestBody: Record<string, unknown>,
    vaultPath?: string,
  ): Promise<AdapterForwardResult> {
    const slashIdx = resolvedModel.indexOf('/');
    const providerAlias = slashIdx !== -1 ? resolvedModel.slice(0, slashIdx) : resolvedModel;
    const adapter = this.registry.get(providerAlias);

    const stream = requestBody.stream === true;
    const nativeFormat = adapter.nativeFormat;
    const providerModelName = slashIdx !== -1 ? resolvedModel.slice(slashIdx + 1) : resolvedModel;

    let translatedBody: Record<string, unknown>;
    if (nativeFormat !== 'openai') {
      translatedBody = this.translator.translateRequest(requestBody, { fromFormat: 'openai', toFormat: nativeFormat });
      this.metrics.recordFormatTranslation('openai', nativeFormat);
    } else {
      translatedBody = requestBody;
    }

    // Ensure provider receives the correct model name (not the client-side alias)
    const bodyWithModel = { ...translatedBody, model: providerModelName };

    const start = Date.now();
    let result: AdapterForwardResult;
    try {
      result = await adapter.forward({ providerModel: resolvedModel, body: bodyWithModel, stream, vaultPath });
      this.metrics.recordAdapterForward(providerAlias, providerModelName, 'success');
    } catch (err: unknown) {
      this.metrics.recordAdapterForward(providerAlias, providerModelName, 'error');
      throw err;
    } finally {
      // For streaming, duration = TTFB (time to stream open); for non-streaming, full round-trip
      this.metrics.observeAdapterForwardDuration(providerAlias, providerModelName, (Date.now() - start) / 1000);
    }

    if (!stream && nativeFormat !== 'openai') {
      // pair direction reflects the REQUEST direction (fromFormat: 'openai', toFormat: nativeFormat)
      // translateResponse with same pair converts the provider response back to OpenAI format
      result.data = this.translator.translateResponse(
        result.data as Record<string, unknown>,
        { fromFormat: 'openai', toFormat: nativeFormat },
      );
      this.metrics.recordFormatTranslation(nativeFormat, 'openai');
    }

    return result;
  }
}

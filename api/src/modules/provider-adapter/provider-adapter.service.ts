import { Injectable } from '@nestjs/common';
import { FormatTranslatorService } from '../format-translator/format-translator.service';
import { ProviderAdapterRegistry } from './provider-adapter.registry';
import { AdapterForwardResult } from './provider-adapter.interface';

@Injectable()
export class ProviderAdapterService {
  constructor(
    private readonly registry: ProviderAdapterRegistry,
    private readonly translator: FormatTranslatorService,
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

    const translatedBody = nativeFormat !== 'openai'
      ? this.translator.translateRequest(requestBody, { fromFormat: 'openai', toFormat: nativeFormat })
      : requestBody;

    const result = await adapter.forward({ providerModel: resolvedModel, body: translatedBody, stream, vaultPath });

    if (!stream && nativeFormat !== 'openai') {
      result.data = this.translator.translateResponse(
        result.data as Record<string, unknown>,
        { fromFormat: nativeFormat, toFormat: 'openai' },
      );
    }

    return result;
  }
}

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { VaultService } from '../../../vault/vault.service';
import { ProviderAdapter, AdapterForwardParams, AdapterForwardResult } from '../provider-adapter.interface';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

@Injectable()
export class AnthropicAdapter extends ProviderAdapter {
  readonly providerAlias = 'anthropic';
  readonly nativeFormat = 'anthropic' as const;

  constructor(private readonly vault: VaultService) {
    super();
  }

  async forward(params: AdapterForwardParams): Promise<AdapterForwardResult> {
    const apiKey = params.vaultPath
      ? await this.vault.readSecret(params.vaultPath, 'api_key')
      : await this.vault.getProviderKey('anthropic');

    try {
      const response = await axios.post(ANTHROPIC_API, params.body, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        responseType: params.stream ? 'stream' : 'json',
        timeout: 300_000,
      });

      return {
        data: params.stream ? undefined : response.data,
        headers: { 'x-provider': 'anthropic' },
        stream: params.stream ? response.data : undefined,
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      const status = axiosErr.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(axiosErr.response?.data ?? 'Anthropic error', status);
    }
  }
}

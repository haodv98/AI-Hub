import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { VaultService } from '../../../vault/vault.service';
import { ProviderAdapter, AdapterForwardParams, AdapterForwardResult } from '../provider-adapter.interface';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

@Injectable()
export class GeminiAdapter extends ProviderAdapter {
  readonly providerAlias = 'gemini';
  readonly nativeFormat = 'gemini' as const;

  constructor(private readonly vault: VaultService) {
    super();
  }

  async forward(params: AdapterForwardParams): Promise<AdapterForwardResult> {
    const apiKey = params.vaultPath
      ? await this.vault.readSecret(params.vaultPath, 'api_key')
      : await this.vault.getProviderKey('google');

    const slashIdx = params.providerModel.indexOf('/');
    const modelId = slashIdx !== -1 ? params.providerModel.slice(slashIdx + 1) : params.providerModel;
    const encodedModel = encodeURIComponent(modelId);

    const action = params.stream ? 'streamGenerateContent' : 'generateContent';
    const query = params.stream ? `?alt=sse&key=${apiKey}` : `?key=${apiKey}`;
    const url = `${GEMINI_BASE}/${encodedModel}:${action}${query}`;

    try {
      const response = await axios.post(url, params.body, {
        headers: { 'content-type': 'application/json' },
        responseType: params.stream ? 'stream' : 'json',
        timeout: 300_000,
      });

      return {
        data: params.stream ? undefined : response.data,
        headers: { 'x-provider': 'gemini' },
        stream: params.stream ? response.data : undefined,
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      const status = axiosErr.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(axiosErr.response?.data ?? 'Gemini error', status);
    }
  }
}

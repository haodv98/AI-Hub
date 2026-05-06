import { HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { VaultService } from '../../../vault/vault.service';
import { ProviderAdapter, AdapterForwardParams, AdapterForwardResult } from '../provider-adapter.interface';

export class OpenAICompatibleAdapter extends ProviderAdapter {
  readonly nativeFormat = 'openai' as const;

  constructor(
    readonly providerAlias: string,
    private readonly defaultBaseUrl: string,
    private readonly vault: VaultService,
    private readonly authHeaderName = 'Authorization',
    private readonly authPrefix = 'Bearer ',
    private readonly extraHeaders: Record<string, string> = {},
    private readonly chatPath = '/chat/completions',
  ) {
    super();
  }

  async forward(params: AdapterForwardParams): Promise<AdapterForwardResult> {
    const vaultPath = params.vaultPath ?? `kv/aihub/providers/${this.providerAlias}/shared`;
    // Skip Vault read when no auth is configured (e.g. local Ollama)
    const apiKey = this.authPrefix === ''
      ? ''
      : await this.vault.readSecret(vaultPath, 'api_key');

    const baseUrl = params.vaultPath
      ? await this.vault.readSecret(params.vaultPath, 'base_url').catch(() => this.defaultBaseUrl)
      : this.defaultBaseUrl;

    try {
      const response = await axios.post(`${baseUrl}${this.chatPath}`, params.body, {
        headers: {
          [this.authHeaderName]: `${this.authPrefix}${apiKey}`,
          'content-type': 'application/json',
          ...this.extraHeaders,
        },
        responseType: params.stream ? 'stream' : 'json',
        timeout: 300_000,
      });

      return {
        data: params.stream ? undefined : response.data,
        headers: { 'x-provider': this.providerAlias },
        stream: params.stream ? response.data : undefined,
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      const status = axiosErr.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(axiosErr.response?.data ?? `${this.providerAlias} error`, status);
    }
  }
}

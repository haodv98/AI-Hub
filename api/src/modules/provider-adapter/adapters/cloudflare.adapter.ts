import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { VaultService } from '../../../vault/vault.service';
import { ProviderAdapter, AdapterForwardParams, AdapterForwardResult } from '../provider-adapter.interface';

const CF_BASE = 'https://api.cloudflare.com/client/v4/accounts';

@Injectable()
export class CloudflareAdapter extends ProviderAdapter {
  readonly providerAlias = 'cloudflare';
  readonly nativeFormat = 'openai' as const;

  constructor(private readonly vault: VaultService) {
    super();
  }

  async forward(params: AdapterForwardParams): Promise<AdapterForwardResult> {
    const vaultPath = params.vaultPath ?? `kv/aihub/providers/cloudflare/shared`;
    const [apiKey, accountId] = await Promise.all([
      this.vault.readSecret(vaultPath, 'api_key'),
      this.vault.readSecret(vaultPath, 'account_id'),
    ]);

    const modelId = params.body.model as string;
    const url = `${CF_BASE}/${accountId}/ai/run/${encodeURIComponent(modelId)}`;

    try {
      const response = await axios.post(url, params.body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        responseType: 'json',
        timeout: 300_000,
      });

      // Normalize Cloudflare response: {result: {response}} → OpenAI format
      const cf = response.data as { result?: { response?: string } };
      const text = cf.result?.response ?? '';
      const normalized = {
        id: `chatcmpl-cf-${Date.now()}`,
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };

      return {
        data: normalized,
        headers: { 'x-provider': 'cloudflare' },
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      const status = axiosErr.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(axiosErr.response?.data ?? 'Cloudflare Workers AI error', status);
    }
  }
}

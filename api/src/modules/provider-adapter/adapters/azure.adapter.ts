import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { VaultService } from '../../../vault/vault.service';
import { ProviderAdapter, AdapterForwardParams, AdapterForwardResult } from '../provider-adapter.interface';

@Injectable()
export class AzureOpenAIAdapter extends ProviderAdapter {
  readonly providerAlias = 'azure';
  readonly nativeFormat = 'openai' as const;

  constructor(private readonly vault: VaultService) {
    super();
  }

  async forward(params: AdapterForwardParams): Promise<AdapterForwardResult> {
    const vaultPath = params.vaultPath ?? `kv/aihub/providers/azure/shared`;
    const [apiKey, endpoint, apiVersion] = await Promise.all([
      this.vault.readSecret(vaultPath, 'api_key'),
      this.vault.readSecret(vaultPath, 'endpoint'),
      this.vault.readSecret(vaultPath, 'api_version').catch(() => '2024-02-01'),
    ]);

    // params.body.model is the deployment name (set by ProviderAdapterService from resolvedModel)
    const deploymentName = params.body.model as string;
    const url = `${endpoint}/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions?api-version=${apiVersion}`;

    try {
      const response = await axios.post(url, params.body, {
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        responseType: params.stream ? 'stream' : 'json',
        timeout: 300_000,
      });

      return {
        data: params.stream ? undefined : response.data,
        headers: { 'x-provider': 'azure' },
        stream: params.stream ? response.data : undefined,
      };
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown } };
      const status = axiosErr.response?.status ?? HttpStatus.BAD_GATEWAY;
      throw new HttpException(axiosErr.response?.data ?? 'Azure OpenAI error', status);
    }
  }
}

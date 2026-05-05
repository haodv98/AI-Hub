import { VaultService } from '../../../vault/vault.service';
import { OpenAICompatibleAdapter } from './openai-compatible.adapter';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super(
      'openrouter',
      OPENROUTER_URL,
      vault,
      'Authorization',
      'Bearer ',
      {
        'HTTP-Referer': process.env.AIHUB_PUBLIC_URL ?? 'https://aihub.internal',
        'X-Title': 'AI Hub',
      },
    );
  }
}

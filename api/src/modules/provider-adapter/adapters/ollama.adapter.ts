import { VaultService } from '../../../vault/vault.service';
import { OpenAICompatibleAdapter } from './openai-compatible.adapter';

export class OllamaAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    // No auth for local Ollama; baseUrl overridable via vaultPath base_url
    super('ollama', 'http://localhost:11434/v1', vault, 'Authorization', '');
  }
}

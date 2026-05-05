import { Module } from '@nestjs/common';
import { VaultModule } from '../../vault/vault.module';
import { FormatTranslatorModule } from '../format-translator/format-translator.module';
import { ProviderAdapterRegistry } from './provider-adapter.registry';
import { ProviderAdapterService } from './provider-adapter.service';
import { PROVIDER_ADAPTERS } from './provider-adapter.interface';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible.adapter';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';
import { VaultService } from '../../vault/vault.service';

@Module({
  imports: [VaultModule, FormatTranslatorModule],
  providers: [
    AnthropicAdapter,
    GeminiAdapter,
    {
      provide: 'OPENAI_ADAPTER',
      useFactory: (vault: VaultService) => new OpenAICompatibleAdapter('openai', 'https://api.openai.com/v1', vault),
      inject: [VaultService],
    },
    {
      provide: 'OPENROUTER_ADAPTER',
      useFactory: (vault: VaultService) => new OpenRouterAdapter(vault),
      inject: [VaultService],
    },
    {
      provide: PROVIDER_ADAPTERS,
      useFactory: (
        anthropic: AnthropicAdapter,
        gemini: GeminiAdapter,
        openai: OpenAICompatibleAdapter,
        openrouter: OpenRouterAdapter,
      ) => [anthropic, gemini, openai, openrouter],
      inject: [AnthropicAdapter, GeminiAdapter, 'OPENAI_ADAPTER', 'OPENROUTER_ADAPTER'],
    },
    ProviderAdapterRegistry,
    ProviderAdapterService,
  ],
  exports: [ProviderAdapterService],
})
export class ProviderAdapterModule {}

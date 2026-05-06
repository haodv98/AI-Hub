import { Module } from '@nestjs/common';
import { VaultModule } from '../../vault/vault.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { MetricsModule } from '../metrics/metrics.module';
import { FormatTranslatorModule } from '../format-translator/format-translator.module';
import { ProviderAdapterRegistry } from './provider-adapter.registry';
import { ProviderAdapterService } from './provider-adapter.service';
import { ProviderComboService } from './provider-combo.service';
import { ProviderComboController } from './provider-combo.controller';
import { PROVIDER_ADAPTERS } from './provider-adapter.interface';
import { VaultService } from '../../vault/vault.service';
// Core adapters
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { CohereAdapter } from './adapters/cohere.adapter';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible.adapter';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';
import { AzureOpenAIAdapter } from './adapters/azure.adapter';
import { OllamaAdapter } from './adapters/ollama.adapter';
import { CloudflareAdapter } from './adapters/cloudflare.adapter';
// Batch OpenAI-compatible adapters
import {
  DeepSeekAdapter, GroqAdapter, XAIAdapter, MistralAdapter, PerplexityAdapter,
  TogetherAdapter, FireworksAdapter, CerebrasAdapter, NvidiaAdapter, NebiusAdapter,
  SiliconFlowAdapter, HyperbolicAdapter, GLMAdapter, KimiAdapter, MiniMaxAdapter,
  AlibabaAdapter, VolcengineAdapter, BytePlusAdapter, BlackboxAdapter, ChutesAdapter,
} from './adapters/openai-compatible-providers';

type AdapterFactory = (vault: VaultService) => OpenAICompatibleAdapter;

function compatProvider(token: string, factory: AdapterFactory) {
  return {
    provide: token,
    useFactory: (vault: VaultService) => factory(vault),
    inject: [VaultService],
  };
}

const BATCH_PROVIDERS = [
  compatProvider('OPENAI_ADAPTER',      (v) => new OpenAICompatibleAdapter('openai', 'https://api.openai.com/v1', v)),
  compatProvider('OPENROUTER_ADAPTER',  (v) => new OpenRouterAdapter(v)),
  compatProvider('DEEPSEEK_ADAPTER',    (v) => new DeepSeekAdapter(v)),
  compatProvider('GROQ_ADAPTER',        (v) => new GroqAdapter(v)),
  compatProvider('XAI_ADAPTER',         (v) => new XAIAdapter(v)),
  compatProvider('MISTRAL_ADAPTER',     (v) => new MistralAdapter(v)),
  compatProvider('PERPLEXITY_ADAPTER',  (v) => new PerplexityAdapter(v)),
  compatProvider('TOGETHER_ADAPTER',    (v) => new TogetherAdapter(v)),
  compatProvider('FIREWORKS_ADAPTER',   (v) => new FireworksAdapter(v)),
  compatProvider('CEREBRAS_ADAPTER',    (v) => new CerebrasAdapter(v)),
  compatProvider('NVIDIA_ADAPTER',      (v) => new NvidiaAdapter(v)),
  compatProvider('NEBIUS_ADAPTER',      (v) => new NebiusAdapter(v)),
  compatProvider('SILICONFLOW_ADAPTER', (v) => new SiliconFlowAdapter(v)),
  compatProvider('HYPERBOLIC_ADAPTER',  (v) => new HyperbolicAdapter(v)),
  compatProvider('GLM_ADAPTER',         (v) => new GLMAdapter(v)),
  compatProvider('KIMI_ADAPTER',        (v) => new KimiAdapter(v)),
  compatProvider('MINIMAX_ADAPTER',     (v) => new MiniMaxAdapter(v)),
  compatProvider('ALIBABA_ADAPTER',     (v) => new AlibabaAdapter(v)),
  compatProvider('VOLCENGINE_ADAPTER',  (v) => new VolcengineAdapter(v)),
  compatProvider('BYTEPLUS_ADAPTER',    (v) => new BytePlusAdapter(v)),
  compatProvider('BLACKBOX_ADAPTER',    (v) => new BlackboxAdapter(v)),
  compatProvider('CHUTES_ADAPTER',      (v) => new ChutesAdapter(v)),
  compatProvider('OLLAMA_ADAPTER',      (v) => new OllamaAdapter(v)),
];

const BATCH_TOKENS = BATCH_PROVIDERS.map((p) => p.provide as string);

@Module({
  imports: [VaultModule, FormatTranslatorModule, PrismaModule, MetricsModule],
  controllers: [ProviderComboController],
  providers: [
    AnthropicAdapter,
    GeminiAdapter,
    CohereAdapter,
    AzureOpenAIAdapter,
    CloudflareAdapter,
    ...BATCH_PROVIDERS,
    {
      provide: PROVIDER_ADAPTERS,
      useFactory: (
        anthropic: AnthropicAdapter,
        gemini: GeminiAdapter,
        cohere: CohereAdapter,
        azure: AzureOpenAIAdapter,
        cloudflare: CloudflareAdapter,
        ...rest: OpenAICompatibleAdapter[]
      ) => [anthropic, gemini, cohere, azure, cloudflare, ...rest],
      inject: [AnthropicAdapter, GeminiAdapter, CohereAdapter, AzureOpenAIAdapter, CloudflareAdapter, ...BATCH_TOKENS],
    },
    ProviderAdapterRegistry,
    ProviderAdapterService,
    ProviderComboService,
  ],
  exports: [ProviderAdapterService, ProviderComboService],
})
export class ProviderAdapterModule {}

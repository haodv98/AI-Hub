import { VaultService } from '../../../vault/vault.service';
import { OpenAICompatibleAdapter } from './openai-compatible.adapter';

// Batch A — TASK-423
export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('deepseek', 'https://api.deepseek.com/v1', vault);
  }
}

export class GroqAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('groq', 'https://api.groq.com/openai/v1', vault);
  }
}

export class XAIAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('xai', 'https://api.x.ai/v1', vault);
  }
}

export class MistralAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('mistral', 'https://api.mistral.ai/v1', vault);
  }
}

export class PerplexityAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('perplexity', 'https://api.perplexity.ai', vault);
  }
}

// Batch B — TASK-424
export class TogetherAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('together', 'https://api.together.xyz/v1', vault);
  }
}

export class FireworksAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('fireworks', 'https://api.fireworks.ai/inference/v1', vault);
  }
}

export class CerebrasAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('cerebras', 'https://api.cerebras.ai/v1', vault);
  }
}

export class NvidiaAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('nvidia', 'https://integrate.api.nvidia.com/v1', vault);
  }
}

export class NebiusAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('nebius', 'https://api.studio.nebius.ai/v1', vault);
  }
}

// Batch C — TASK-425
export class SiliconFlowAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('siliconflow', 'https://api.siliconflow.cn/v1', vault);
  }
}

export class HyperbolicAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('hyperbolic', 'https://api.hyperbolic.xyz/v1', vault);
  }
}

export class GLMAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('glm', 'https://open.bigmodel.cn/api/paas/v4', vault);
  }
}

export class KimiAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('kimi', 'https://api.moonshot.cn/v1', vault);
  }
}

export class MiniMaxAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('minimax', 'https://api.minimax.chat', vault, 'Authorization', 'Bearer ', {}, '/text/chatcompletion_v2');
  }
}

// Batch D — TASK-426
export class AlibabaAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('alibaba', 'https://dashscope.aliyuncs.com/compatible-mode/v1', vault);
  }
}

export class VolcengineAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('volcengine', 'https://ark.cn-beijing.volces.com/api/v3', vault);
  }
}

export class BytePlusAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('byteplus', 'https://ark.ap-southeast.bytepluses.com/api/v3', vault);
  }
}

export class BlackboxAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('blackbox', 'https://api.blackbox.ai', vault);
  }
}

export class ChutesAdapter extends OpenAICompatibleAdapter {
  constructor(vault: VaultService) {
    super('chutes', 'https://llm.chutes.ai/v1', vault);
  }
}

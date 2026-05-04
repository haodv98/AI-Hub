import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ProviderType } from '@prisma/client';

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  details: string;
  error: string | null;
}

const TIMEOUT_MS = 5000;

// Block SSRF targets — private/loopback/link-local ranges
const PRIVATE_IP_PATTERN =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|::1|fd[0-9a-f]{2}:)/i;

@Injectable()
export class ProviderTestService {
  constructor(private readonly config: ConfigService) {}

  async testConnection(
    provider: ProviderType,
    apiKey: string,
    gatewayUrl?: string,
  ): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      await this.probe(provider, apiKey, gatewayUrl);
      return { success: true, latencyMs: Date.now() - start, details: 'Connection successful', error: null };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        latencyMs: Date.now() - start,
        details: 'Connection failed',
        error: this.sanitizeError(raw, apiKey),
      };
    }
  }

  private async probe(provider: ProviderType, apiKey: string, gatewayUrl?: string): Promise<void> {
    switch (provider) {
      case ProviderType.ANTHROPIC:
        await this.probeAnthropic(apiKey);
        break;
      case ProviderType.OPENAI:
        await this.probeOpenAI(apiKey);
        break;
      case ProviderType.GOOGLE:
        await this.probeGoogle(apiKey);
        break;
      case ProviderType.CURSOR:
        await this.probeCursor(apiKey);
        break;
      case ProviderType.OTHER:
        if (!gatewayUrl) throw new Error('gatewayUrl is required for OTHER provider');
        this.assertSafeUrl(gatewayUrl);
        await this.probeOther(apiKey, gatewayUrl);
        break;
      default:
        throw new Error(`Unsupported provider: ${String(provider)}`);
    }
  }

  private assertSafeUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('gatewayUrl is not a valid URL');
    }
    if (PRIVATE_IP_PATTERN.test(parsed.hostname)) {
      throw new BadRequestException('gatewayUrl must not point to a private or loopback address');
    }
  }

  private async probeAnthropic(apiKey: string): Promise<void> {
    // Anthropic returns 401 for invalid key, 400 for bad model name (key recognized) — both indicate key validity
    await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
      {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        timeout: TIMEOUT_MS,
        validateStatus: (s) => s === 200 || s === 400, // 401 = auth error = key invalid → throws
      },
    );
  }

  private async probeOpenAI(apiKey: string): Promise<void> {
    await axios.get('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: TIMEOUT_MS,
    });
  }

  private async probeGoogle(apiKey: string): Promise<void> {
    // Use header to avoid key in URL (logs, proxies)
    await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
      timeout: TIMEOUT_MS,
    });
  }

  private async probeCursor(apiKey: string): Promise<void> {
    const baseUrl = this.config.get('CURSOR_API_BASE_URL', 'https://api.cursor.sh');
    await axios.get(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: TIMEOUT_MS,
    });
  }

  private async probeOther(apiKey: string, gatewayUrl: string): Promise<void> {
    // No fallback to GET / — avoids sending credentials to arbitrary root path
    await axios.get(`${gatewayUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: TIMEOUT_MS,
      validateStatus: (s) => s < 500, // 2xx/3xx/4xx = gateway is reachable
    });
  }

  private sanitizeError(error: string, apiKey: string): string {
    if (!apiKey) return error;
    // Full replacement — more robust than prefix-regex
    return error.split(apiKey).join('[REDACTED]');
  }
}

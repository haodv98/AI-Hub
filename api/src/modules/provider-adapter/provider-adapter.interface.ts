import { ChatFormat } from '../format-translator/format-translator.types';

export interface AdapterForwardParams {
  providerModel: string;
  body: Record<string, unknown>;
  stream: boolean;
  vaultPath?: string;
}

export interface AdapterForwardResult {
  data: unknown;
  headers: Record<string, string>;
  stream?: NodeJS.ReadableStream;
}

export abstract class ProviderAdapter {
  abstract readonly providerAlias: string;
  abstract readonly nativeFormat: ChatFormat;
  abstract forward(params: AdapterForwardParams): Promise<AdapterForwardResult>;
}

export const PROVIDER_ADAPTERS = Symbol('PROVIDER_ADAPTERS');

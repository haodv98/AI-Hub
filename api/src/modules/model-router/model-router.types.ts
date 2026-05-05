export interface ResolveContext {
  apiKeyId: string;
  teamId?: string;
  userId?: string;
}

export interface ResolveResult {
  providerModel: string;
  matchedAlias?: {
    id: string;
    fromPattern: string;
    scope: string;
    priority: number;
  };
  comboName?: string;
  isPassthrough: boolean;
}

export interface ParsedProviderModel {
  provider: string;
  modelId: string;
}

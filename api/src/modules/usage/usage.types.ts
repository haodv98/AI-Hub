export interface UsageEvent {
  userId: string;
  teamId: string | null;
  apiKeyId: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs?: number;
}

export interface UsageSummaryRow {
  date: Date;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

export interface UsageByModelRow {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  requestCount: number;
}

export interface DailySummaryRow {
  date: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

export interface TeamSummaryRow {
  teamId: string;
  teamName: string;
  costUsd: number;
  totalTokens: number;
  requestCount: number;
}

export interface OrgSummary {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  teamCount: number;
  byDay: DailySummaryRow[];
  byTeam: TeamSummaryRow[];
}

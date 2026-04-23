#!/usr/bin/env npx ts-node
import axios from 'axios';

type Tier = 'MEMBER' | 'SENIOR' | 'LEAD';

interface TeamTemplate {
  monthlyBudgetUsd: number;
  engines: string[];
  rpm: number;
  fallback?: { fromModel: string; toModel: string; thresholdPct: number };
}

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('Missing ADMIN_TOKEN');
  process.exit(1);
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
});

const TEMPLATES: Record<string, TeamTemplate> = {
  frontend: { monthlyBudgetUsd: 450, engines: ['claude-sonnet-4-6', 'gpt-4o'], rpm: 30 },
  backend: {
    monthlyBudgetUsd: 700,
    engines: ['claude-sonnet-4-6', 'gpt-4o', 'claude-haiku-4-5-20251001'],
    rpm: 40,
    fallback: {
      fromModel: 'claude-sonnet-4-6',
      toModel: 'claude-haiku-4-5-20251001',
      thresholdPct: 90,
    },
  },
  devops: { monthlyBudgetUsd: 300, engines: ['claude-haiku-4-5-20251001', 'gpt-4o-mini'], rpm: 20 },
  qa: { monthlyBudgetUsd: 280, engines: ['claude-haiku-4-5-20251001', 'gpt-4o-mini'], rpm: 20 },
  'data/ml': { monthlyBudgetUsd: 900, engines: ['gpt-4o', 'claude-sonnet-4-6'], rpm: 45 },
  'product/pm': { monthlyBudgetUsd: 250, engines: ['claude-haiku-4-5-20251001', 'gpt-4o-mini'], rpm: 15 },
  'design/ux': { monthlyBudgetUsd: 260, engines: ['gpt-4o-mini', 'claude-haiku-4-5-20251001'], rpm: 15 },
  'hr/admin': { monthlyBudgetUsd: 120, engines: ['gemini-2.5-flash'], rpm: 10 },
  'sales/bd': { monthlyBudgetUsd: 200, engines: ['gpt-4o-mini', 'gemini-2.5-flash'], rpm: 15 },
};

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

async function createPolicy(
  teamId: string,
  teamName: string,
  tier: Tier | null,
  priority: number,
  template: TeamTemplate,
) {
  const suffix = tier ? `-${tier.toLowerCase()}` : '-base';
  const payload = {
    name: `${teamName}${suffix}`,
    description: `Auto-seeded policy for ${teamName}${tier ? ` (${tier})` : ''}`,
    teamId,
    tier,
    priority,
    isActive: true,
    allowedEngines: template.engines,
    config: {
      limits: {
        rpm: tier === 'LEAD' ? Math.round(template.rpm * 1.3) : template.rpm,
        monthlyBudgetUsd:
          tier === 'LEAD'
            ? Math.round(template.monthlyBudgetUsd * 1.5)
            : tier === 'SENIOR'
              ? Math.round(template.monthlyBudgetUsd * 1.2)
              : template.monthlyBudgetUsd,
      },
      ...(template.fallback ? { fallback: template.fallback } : {}),
    },
  };
  await api.post('/policies', payload);
}

async function main() {
  const teams = (await api.get('/teams')).data.data as Array<{ id: string; name: string }>;
  const users = (await api.get('/users', { params: { limit: 500 } })).data.data as Array<{
    id: string;
    teamMembers: Array<{ team: { id: string } }>;
  }>;

  let created = 0;
  for (const team of teams) {
    const key = normalizeTeamName(team.name);
    const template = TEMPLATES[key];
    if (!template) {
      console.log(`Skip ${team.name}: no template`);
      continue;
    }

    for (const [tier, priority] of [
      [null, 10],
      ['MEMBER', 20],
      ['SENIOR', 25],
      ['LEAD', 30],
    ] as const) {
      try {
        await createPolicy(team.id, team.name, tier, priority, template);
        created += 1;
      } catch (err: any) {
        if (err?.response?.status === 409) continue;
        throw err;
      }
    }

    const sample = users.find((u) => u.teamMembers.some((tm) => tm.team.id === team.id));
    if (sample) {
      await api.post('/policies/simulate', { userId: sample.id, model: template.engines[0], currentCostUsd: 0 });
    }
  }

  console.log(`Seed policies completed. Created ${created} policies.`);
}

main().catch((err: any) => {
  console.error('seed-policies failed:', err?.response?.data ?? err?.message ?? err);
  process.exit(1);
});


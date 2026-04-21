#!/usr/bin/env npx ts-node
/**
 * pilot-setup.ts
 *
 * Creates pilot teams, users, and API keys for the 2-team Phase 2 pilot.
 * Outputs a pilot-keys.csv file. Distribute via secure channel, then delete.
 *
 * Usage:
 *   npx ts-node scripts/pilot-setup.ts
 *
 * Required env:
 *   API_BASE_URL   - AIHub API base URL (default: http://localhost:3001/api/v1)
 *   ADMIN_TOKEN    - Keycloak access token for IT_ADMIN
 */

import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJsMVJoQnZCRVA3cFZKYTRZQjZaYTIzT1U5dVkwaUcyZWlwYnNRMl9fUmJBIn0.eyJleHAiOjE3NzY3NTc0OTgsImlhdCI6MTc3Njc1NzE5OCwianRpIjoib25ydHJ0Ojc1NzM5YTQwLTI3NDctOTFjMC1hYjdmLTg3YTVhNzUwZDczYSIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9yZWFsbXMvYWlodWIiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJhaWh1Yi1hZG1pbi1wb3J0YWwiLCJzaWQiOiJQT1ljOHVDSTdUQmVuVW5oWkVzdjcteVciLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsiaXRfYWRtaW4iXX0sInNjb3BlIjoib3BlbmlkIGVtYWlsIHByb2ZpbGUiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmFtZSI6IkFkbWluIFVzZXIiLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJhZG1pbkBhaWh1Yi5kZXYiLCJnaXZlbl9uYW1lIjoiQWRtaW4iLCJmYW1pbHlfbmFtZSI6IlVzZXIiLCJlbWFpbCI6ImFkbWluQGFpaHViLmRldiJ9.C0A63Z-HeRgkboVAix29AH3nX92GWUfCNQ1DAN36uHNkYKAHUiWvL29zqS5ujYUDZ_htjvo_mPh5ukRBSjfGOX2u3nQyn-SSORh_EousawtBHgA5vSOzUJ3Qz00Gg3cSpADj6a0Ts2a9Fy77JjGJTMQ_XlAen0kAYV8GfD6qy4sZtREcRcVTpRs351pB1WaAsHJmH55n1tHTbOlwrkMdUEZU2ubukiop0wPDFmNGhBEhZ7ez4T-FmcZD3L8x5U_l0BPaXOuIFuwimi61iUWfoh_Hv2U1T1pa3zS4yAbMlIf8mwO-jW79eDd57n9nNHyQ_VAqOolWwNdcsxh64AfFIQ';

if (!ADMIN_TOKEN) {
  console.error('ERROR: ADMIN_TOKEN env var is required');
  process.exit(1);
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
});

// ── Pilot config ──────────────────────────────────────────────────────────────

interface PilotUser {
  email: string;
  fullName: string;
  tier: 'MEMBER' | 'SENIOR' | 'LEAD';
}

interface PilotTeam {
  name: string;
  description: string;
  monthlyBudgetUsd: number;
  members: PilotUser[];
}

const PILOT_TEAMS: PilotTeam[] = [
  {
    name: 'Backend Engineering',
    description: 'Backend services and API development team',
    monthlyBudgetUsd: 500,
    members: [
      { email: 'backend-lead@company.com', fullName: 'Backend Lead', tier: 'LEAD' },
      { email: 'backend-senior1@company.com', fullName: 'Backend Senior 1', tier: 'SENIOR' },
      { email: 'backend-dev1@company.com', fullName: 'Backend Dev 1', tier: 'MEMBER' },
      { email: 'backend-dev2@company.com', fullName: 'Backend Dev 2', tier: 'MEMBER' },
    ],
  },
  {
    name: 'Product & PM',
    description: 'Product management and design team',
    monthlyBudgetUsd: 300,
    members: [
      { email: 'pm-lead@company.com', fullName: 'PM Lead', tier: 'LEAD' },
      { email: 'pm-senior@company.com', fullName: 'PM Senior', tier: 'SENIOR' },
      { email: 'product-designer@company.com', fullName: 'Product Designer', tier: 'MEMBER' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

type KeyEntry = { team: string; email: string; fullName: string; keyPlaintext: string };

async function createTeam(team: PilotTeam): Promise<string> {
  const res = await api.post('/teams', {
    name: team.name,
    description: team.description,
    monthlyBudgetUsd: team.monthlyBudgetUsd,
  });
  return res.data.data.id as string;
}

async function createUser(user: PilotUser): Promise<string> {
  const res = await api.post('/users', {
    email: user.email,
    fullName: user.fullName,
    role: 'EMPLOYEE',
  });
  return res.data.data.id as string;
}

async function addToTeam(teamId: string, userId: string, tier: string): Promise<void> {
  await api.post(`/teams/${teamId}/members`, { userId, tier });
}

async function generateKey(userId: string): Promise<string> {
  const res = await api.post('/keys', { userId });
  return res.data.data.plaintext as string;
}

async function createDefaultPolicy(teamId: string, teamName: string): Promise<void> {
  await api.post('/policies', {
    name: `${teamName} — default`,
    teamId,
    isActive: true,
    priority: 50,
    allowedEngines: [],
    config: {
      limits: { rpm: 60, monthlyBudgetUsd: undefined },
    },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const keys: KeyEntry[] = [];

  for (const teamConfig of PILOT_TEAMS) {
    console.log(`\nCreating team: ${teamConfig.name}`);

    const teamId = await createTeam(teamConfig);
    console.log(`  Team created: ${teamId}`);

    await createDefaultPolicy(teamId, teamConfig.name);
    console.log(`  Default policy created`);

    for (const member of teamConfig.members) {
      console.log(`  Adding member: ${member.email}`);

      const userId = await createUser(member);
      await addToTeam(teamId, userId, member.tier);
      const plaintext = await generateKey(userId);

      keys.push({
        team: teamConfig.name,
        email: member.email,
        fullName: member.fullName,
        keyPlaintext: plaintext,
      });
      console.log(`    Key: ${plaintext.substring(0, 20)}… (stored in CSV)`);
    }
  }

  // Write CSV
  const csvPath = join(process.cwd(), 'pilot-keys.csv');
  const csv = [
    'team,email,full_name,api_key',
    ...keys.map((k) => `"${k.team}","${k.email}","${k.fullName}","${k.keyPlaintext}"`),
  ].join('\n');
  writeFileSync(csvPath, csv, 'utf-8');

  console.log(`\n✓ Pilot setup complete!`);
  console.log(`  Teams created: ${PILOT_TEAMS.length}`);
  console.log(`  Users provisioned: ${keys.length}`);
  console.log(`  Keys written to: pilot-keys.csv`);
  console.log(`\nWARNING: Distribute pilot-keys.csv via secure channel, then delete it.`);
}

main().catch((err) => {
  console.error('Pilot setup failed:', err.response?.data ?? err.message);
  process.exit(1);
});

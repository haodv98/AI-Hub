#!/usr/bin/env npx ts-node
import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';

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

interface UserRow {
  id: string;
  email: string;
  status: string;
}

async function loadAllUsers(): Promise<UserRow[]> {
  const users: UserRow[] = [];
  let page = 1;
  const limit = 200;

  while (true) {
    const res = await api.get('/users', { params: { page, limit } });
    const batch = (res.data.data ?? []) as UserRow[];
    users.push(...batch);
    if (batch.length < limit) break;
    page += 1;
  }
  return users;
}

async function loadActiveKeyUsers(): Promise<Set<string>> {
  const activeUsers = new Set<string>();
  let page = 1;
  const limit = 500;
  while (true) {
    const res = await api.get('/keys', { params: { page, limit } });
    const keys = (res.data.data ?? []) as Array<{ userId: string; status: string }>;
    for (const key of keys) {
      if (key.status === 'ACTIVE' || key.status === 'ROTATING') {
        activeUsers.add(key.userId);
      }
    }
    if (keys.length < limit) break;
    page += 1;
  }
  return activeUsers;
}

async function generateKey(userId: string): Promise<string> {
  const res = await api.post('/keys', null, { params: { userId } });
  return res.data.data.key as string;
}

async function main() {
  const users = (await loadAllUsers()).filter((u) => u.status === 'ACTIVE');
  const activeKeyUsers = await loadActiveKeyUsers();
  const output: Array<{ email: string; apiKey: string }> = [];

  for (const user of users) {
    if (activeKeyUsers.has(user.id)) continue;

    const key = await generateKey(user.id);
    output.push({ email: user.email, apiKey: key });
    console.log(`Generated key for ${user.email}`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const outFile = join(process.cwd(), `bulk-keys-${date}.csv`);
  const csv = ['user_email,key_plaintext', ...output.map((r) => `${r.email},${r.apiKey}`)].join('\n');
  writeFileSync(outFile, csv, { encoding: 'utf-8', mode: 0o600 });

  console.log(`Done. Generated ${output.length} keys -> ${outFile}`);
  console.log('WARNING: distribute securely and delete this file after delivery.');
}

main().catch((err: any) => {
  console.error('bulk-keygen failed:', err?.response?.data ?? err?.message ?? err);
  process.exit(1);
});


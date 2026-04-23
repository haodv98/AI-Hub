#!/usr/bin/env npx ts-node
import axios from 'axios';

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

async function generateKey(userId: string): Promise<{ id: string; keyPrefix: string; createdAt: string }> {
  const res = await api.post('/keys', null, { params: { userId } });
  return {
    id: res.data.data.id as string,
    keyPrefix: res.data.data.keyPrefix as string,
    createdAt: res.data.data.createdAt as string,
  };
}

async function main() {
  const users = (await loadAllUsers()).filter((u) => u.status === 'ACTIVE');
  const activeKeyUsers = await loadActiveKeyUsers();
  const output: Array<{ email: string; keyId: string; keyPrefix: string; createdAt: string }> = [];
  const errors: Array<{ email: string; reason: string }> = [];

  for (const user of users) {
    if (activeKeyUsers.has(user.id)) continue;

    try {
      const key = await generateKey(user.id);
      output.push({ email: user.email, keyId: key.id, keyPrefix: key.keyPrefix, createdAt: key.createdAt });
      console.log(`Generated key metadata for ${user.email} (${key.keyPrefix})`);
    } catch (err: any) {
      errors.push({ email: user.email, reason: err?.response?.data?.message ?? err?.message ?? 'unknown_error' });
    }
  }

  console.log(JSON.stringify({
    success: output.length,
    failed: errors.length,
    generated: output,
    errors,
  }, null, 2));
  console.warn('Security note: output contains key metadata; avoid storing logs in insecure channels.');
}

main().catch((err: any) => {
  console.error('bulk-keygen failed:', err?.response?.data ?? err?.message ?? err);
  process.exit(1);
});


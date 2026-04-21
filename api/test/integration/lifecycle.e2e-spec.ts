/**
 * Integration tests — User/Team/Key lifecycle
 *
 * Tests the end-to-end business flows using in-memory mocks (no Docker required).
 * Each scenario simulates a complete lifecycle step as documented in TASK-084.
 *
 * Scenario 1: create user → assign team → generate key → validate key
 * Scenario 2: rotate key → old key still works during grace period
 * Scenario 3: revoke key → immediate rejection
 * Scenario 4: offboard user → all keys revoked
 */
import { Test, TestingModule } from '@nestjs/testing';
import { KeysService, GeneratedKey } from '../../src/modules/keys/keys.service';
import { UsersService } from '../../src/modules/users/users.service';
import { TeamsService } from '../../src/modules/teams/teams.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { ApiKeyStatus, UserRole, UserStatus, TeamMemberTier } from '@prisma/client';

// ─── Shared state store (simulates DB + Redis in-process) ──────────────────

interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  offboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  teamMembers: any[];
  apiKeys: any[];
}

interface TeamRecord {
  id: string;
  name: string;
  description: string | null;
  monthlyBudgetUsd: number;
  createdAt: Date;
  updatedAt: Date;
  members: any[];
  policies: any[];
  _count: { members: number };
}

interface ApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  status: ApiKeyStatus;
  rotatedFromId: string | null;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: any;
}

const store = {
  users: new Map<string, UserRecord>(),
  teams: new Map<string, TeamRecord>(),
  teamMembers: new Map<string, any>(),
  apiKeys: new Map<string, ApiKeyRecord>(),
  auditLogs: [] as any[],
  redisCache: new Map<string, string>(),
};

let idCounter = 1;
const nextId = () => `test-id-${idCounter++}`;

// ─── Mock factories ─────────────────────────────────────────────────────────

function buildPrismaMock() {
  return {
    user: {
      create: jest.fn(({ data }) => {
        const user: UserRecord = {
          id: nextId(),
          email: data.email,
          fullName: data.fullName,
          role: data.role || UserRole.MEMBER,
          status: UserStatus.ACTIVE,
          offboardedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          teamMembers: [],
          apiKeys: [],
        };
        store.users.set(user.id, user);
        return Promise.resolve(user);
      }),
      findUnique: jest.fn(({ where, include }) => {
        const user = store.users.get(where.id);
        if (!user) return Promise.resolve(null);
        const result = { ...user };
        if (include?.teamMembers) result.teamMembers = [...user.teamMembers];
        if (include?.apiKeys) {
          const statuses: ApiKeyStatus[] = include.apiKeys?.where?.status?.in ?? ['ACTIVE', 'ROTATING'];
          result.apiKeys = [...store.apiKeys.values()].filter(
            (k) => k.userId === user.id && statuses.includes(k.status),
          );
        }
        return Promise.resolve(result);
      }),
      update: jest.fn(({ where, data }) => {
        const user = store.users.get(where.id);
        if (!user) return Promise.resolve(null);
        Object.assign(user, data, { updatedAt: new Date() });
        return Promise.resolve({ ...user });
      }),
      findMany: jest.fn(() => Promise.resolve([...store.users.values()])),
      count: jest.fn(() => Promise.resolve(store.users.size)),
    },
    team: {
      create: jest.fn(({ data }) => {
        const team: TeamRecord = {
          id: nextId(),
          name: data.name,
          description: data.description || null,
          monthlyBudgetUsd: data.monthlyBudgetUsd || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: [],
          policies: [],
          _count: { members: 0 },
        };
        store.teams.set(team.id, team);
        return Promise.resolve(team);
      }),
      findUnique: jest.fn(({ where }) => {
        const team = store.teams.get(where.id);
        if (!team) return Promise.resolve(null);
        const members = [...store.teamMembers.values()].filter((m) => m.teamId === team.id);
        return Promise.resolve({ ...team, members, _count: { members: members.length }, policies: [] });
      }),
      findMany: jest.fn(() => Promise.resolve([...store.teams.values()])),
      delete: jest.fn(({ where }) => {
        store.teams.delete(where.id);
        return Promise.resolve();
      }),
    },
    teamMember: {
      create: jest.fn(({ data }) => {
        const m = { id: nextId(), ...data, createdAt: new Date(), updatedAt: new Date() };
        store.teamMembers.set(`${data.userId}_${data.teamId}`, m);
        return Promise.resolve(m);
      }),
      findUnique: jest.fn(({ where }) => {
        const key = `${where.userId_teamId.userId}_${where.userId_teamId.teamId}`;
        return Promise.resolve(store.teamMembers.get(key) || null);
      }),
      delete: jest.fn(({ where }) => {
        const key = `${where.userId_teamId.userId}_${where.userId_teamId.teamId}`;
        const m = store.teamMembers.get(key);
        store.teamMembers.delete(key);
        return Promise.resolve(m);
      }),
      update: jest.fn(({ where, data }) => {
        const key = `${where.userId_teamId.userId}_${where.userId_teamId.teamId}`;
        const m = store.teamMembers.get(key);
        if (!m) return Promise.resolve(null);
        Object.assign(m, data);
        return Promise.resolve(m);
      }),
    },
    apiKey: {
      create: jest.fn(({ data }) => {
        const key: ApiKeyRecord = {
          id: nextId(),
          userId: data.userId,
          keyHash: data.keyHash,
          keyPrefix: data.keyPrefix,
          status: data.status || ApiKeyStatus.ACTIVE,
          rotatedFromId: data.rotatedFromId || null,
          rotatedAt: data.rotatedAt || null,
          revokedAt: null,
          expiresAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.apiKeys.set(key.id, key);
        return Promise.resolve(key);
      }),
      findUnique: jest.fn(({ where }) => {
        if (where.id) return Promise.resolve(store.apiKeys.get(where.id) || null);
        if (where.keyHash) {
          const key = [...store.apiKeys.values()].find((k) => k.keyHash === where.keyHash);
          return Promise.resolve(key || null);
        }
        return Promise.resolve(null);
      }),
      findFirst: jest.fn(({ where }) => {
        const keys = [...store.apiKeys.values()].filter((k) => {
          if (where.userId && k.userId !== where.userId) return false;
          if (where.status && k.status !== where.status) return false;
          return true;
        });
        return Promise.resolve(keys[0] || null);
      }),
      findMany: jest.fn(({ where }) => {
        const results = [...store.apiKeys.values()].filter((k) => {
          if (where?.userId && k.userId !== where.userId) return false;
          if (where?.status?.in && !where.status.in.includes(k.status)) return false;
          return true;
        });
        return Promise.resolve(results);
      }),
      update: jest.fn(({ where, data }) => {
        const key = store.apiKeys.get(where.id);
        if (!key) return Promise.resolve(null);
        Object.assign(key, data, { updatedAt: new Date() });
        return Promise.resolve({ ...key });
      }),
      count: jest.fn(() => Promise.resolve(store.apiKeys.size)),
    },
    auditLog: {
      create: jest.fn(({ data }) => {
        store.auditLogs.push({ id: nextId(), ...data, createdAt: new Date() });
        return Promise.resolve({});
      }),
    },
  };
}

function buildRedisMock() {
  return {
    get: jest.fn((key: string) => Promise.resolve(store.redisCache.get(key) || null)),
    set: jest.fn((key: string, value: string) => {
      store.redisCache.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      store.redisCache.delete(key);
      return Promise.resolve(1);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    incrbyfloat: jest.fn(() => Promise.resolve(0)),
    zadd: jest.fn(() => Promise.resolve()),
    zremrangebyscore: jest.fn(() => Promise.resolve()),
    zcard: jest.fn(() => Promise.resolve(0)),
    setNx: jest.fn(() => Promise.resolve(true)),
  };
}

// ─── Module setup ────────────────────────────────────────────────────────────

let keysService: KeysService;
let usersService: UsersService;
let teamsService: TeamsService;
let prismaMock: ReturnType<typeof buildPrismaMock>;
let redisMock: ReturnType<typeof buildRedisMock>;

beforeAll(async () => {
  prismaMock = buildPrismaMock();
  redisMock = buildRedisMock();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      KeysService,
      UsersService,
      TeamsService,
      AuditService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: RedisService, useValue: redisMock },
    ],
  }).compile();

  keysService = module.get(KeysService);
  usersService = module.get(UsersService);
  teamsService = module.get(TeamsService);
});

beforeEach(() => {
  // Clear state between tests
  store.users.clear();
  store.teams.clear();
  store.teamMembers.clear();
  store.apiKeys.clear();
  store.auditLogs.length = 0;
  store.redisCache.clear();
  jest.clearAllMocks();
  // Re-attach mock implementations (cleared by clearAllMocks)
  prismaMock = buildPrismaMock();
  redisMock = buildRedisMock();
  (keysService as any).prisma = prismaMock;
  (keysService as any).redis = redisMock;
  (usersService as any).prisma = prismaMock;
  (usersService as any).keys = keysService;
  (teamsService as any).prisma = prismaMock;
  (teamsService as any).keys = keysService;
  const auditService = (keysService as any).audit;
  (auditService as any).prisma = prismaMock;
  (usersService as any).audit = auditService;
  (teamsService as any).audit = auditService;
});

// ─── Scenario 1: create user → assign team → generate key → validate ────────

describe('Scenario 1: create user → assign team → generate key → validate key', () => {
  it('creates a user, assigns to team, generates a key, and key validates successfully', async () => {
    // 1. Create user
    const user = await usersService.create(
      { email: 'alice@example.com', fullName: 'Alice', role: UserRole.MEMBER },
      'admin-id',
    );
    expect(user.id).toBeDefined();
    expect(user.email).toBe('alice@example.com');
    expect(user.status).toBe(UserStatus.ACTIVE);

    // 2. Create team
    const team = await teamsService.create({ name: 'Backend', monthlyBudgetUsd: 500 }, 'admin-id');
    expect(team.id).toBeDefined();

    // 3. Assign user to team (auto-generates key)
    const { membership, generatedKey } = await teamsService.addMember(
      team.id,
      user.id,
      TeamMemberTier.STANDARD,
      'admin-id',
    );
    expect(membership.userId).toBe(user.id);
    expect(membership.teamId).toBe(team.id);
    expect(generatedKey).toBeDefined();
    expect(generatedKey).toMatch(/^aihub_prod_[0-9a-f]{64}$/);

    // 4. Validate key (simulates API call auth)
    const validated = await keysService.validateKey(generatedKey!);
    expect(validated).not.toBeNull();
    expect(validated!.userId).toBe(user.id);
    expect(validated!.status).toBe(ApiKeyStatus.ACTIVE);

    // 5. Verify audit trail logged events
    expect(store.auditLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns key with correct format: aihub_prod_<64 hex chars>', async () => {
    const user = await usersService.create(
      { email: 'bob@example.com', fullName: 'Bob' },
      'admin-id',
    );
    const { plaintext } = await keysService.generateKey(user.id, 'admin-id');
    expect(plaintext).toMatch(/^aihub_prod_[0-9a-f]{64}$/);
  });

  it('does not expose key hash — only prefix stored in metadata', async () => {
    const user = await usersService.create(
      { email: 'charlie@example.com', fullName: 'Charlie' },
      'admin-id',
    );
    const { key, plaintext } = await keysService.generateKey(user.id, 'admin-id');

    // plaintext returned once
    expect(plaintext.length).toBeGreaterThan(0);
    // keyHash ≠ plaintext
    expect(key.keyHash).not.toBe(plaintext);
    // keyPrefix is first 20 chars
    expect(key.keyPrefix).toBe(plaintext.slice(0, 20));
    // Validate SHA-256 hash stored
    const expectedHash = keysService.hashKey(plaintext);
    expect(key.keyHash).toBe(expectedHash);
  });
});

// ─── Scenario 2: rotate key → old key still works during grace period ────────

describe('Scenario 2: rotate key → grace period — old key still valid', () => {
  let originalGenerated: GeneratedKey;
  let rotatedGenerated: GeneratedKey;
  let userId: string;

  beforeEach(async () => {
    const user = await usersService.create(
      { email: 'dave@example.com', fullName: 'Dave' },
      'admin-id',
    );
    userId = user.id;
    originalGenerated = await keysService.generateKey(userId, 'admin-id');
    rotatedGenerated = await keysService.rotateKey(originalGenerated.key.id, 'admin-id');
  });

  it('rotation returns a new key with different plaintext', () => {
    expect(rotatedGenerated.plaintext).not.toBe(originalGenerated.plaintext);
    expect(rotatedGenerated.plaintext).toMatch(/^aihub_prod_[0-9a-f]{64}$/);
  });

  it('new key is ACTIVE and validates successfully', async () => {
    const result = await keysService.validateKey(rotatedGenerated.plaintext);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(ApiKeyStatus.ACTIVE);
  });

  it('old key is in ROTATING status (grace period)', async () => {
    const oldKey = store.apiKeys.get(originalGenerated.key.id);
    expect(oldKey?.status).toBe(ApiKeyStatus.ROTATING);
    expect(oldKey?.rotatedAt).toBeInstanceOf(Date);
  });

  it('old key still validates during grace period', async () => {
    // During grace period, ROTATING keys should still be accepted
    const result = await keysService.validateKey(originalGenerated.plaintext);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(ApiKeyStatus.ROTATING);
  });

  it('audit log records KEY_ROTATE action', () => {
    const rotateLog = store.auditLogs.find((l) => l.action === 'KEY_ROTATE');
    expect(rotateLog).toBeDefined();
    expect(rotateLog.details.oldKeyId).toBe(originalGenerated.key.id);
  });
});

// ─── Scenario 3: revoke → immediate rejection ────────────────────────────────

describe('Scenario 3: revoke key → immediate rejection', () => {
  let generated: GeneratedKey;
  let userId: string;

  beforeEach(async () => {
    const user = await usersService.create(
      { email: 'eve@example.com', fullName: 'Eve' },
      'admin-id',
    );
    userId = user.id;
    generated = await keysService.generateKey(userId, 'admin-id');

    // Cache the key in Redis to verify cache invalidation
    const keyHash = keysService.hashKey(generated.plaintext);
    store.redisCache.set(`apikey:hash:${keyHash}`, JSON.stringify(generated.key));
  });

  it('key validates successfully before revocation', async () => {
    const result = await keysService.validateKey(generated.plaintext);
    expect(result).not.toBeNull();
  });

  it('revoked key returns null immediately after revocation', async () => {
    await keysService.revokeKey(generated.key.id, 'admin-id');
    const result = await keysService.validateKey(generated.plaintext);
    expect(result).toBeNull();
  });

  it('revoked key has REVOKED status in DB', async () => {
    await keysService.revokeKey(generated.key.id, 'admin-id');
    const key = store.apiKeys.get(generated.key.id);
    expect(key?.status).toBe(ApiKeyStatus.REVOKED);
    expect(key?.revokedAt).toBeInstanceOf(Date);
  });

  it('Redis cache is cleared after revocation', async () => {
    const keyHash = keysService.hashKey(generated.plaintext);
    expect(store.redisCache.has(`apikey:hash:${keyHash}`)).toBe(true);

    await keysService.revokeKey(generated.key.id, 'admin-id');

    expect(store.redisCache.has(`apikey:hash:${keyHash}`)).toBe(false);
  });

  it('audit log records KEY_REVOKE action', async () => {
    await keysService.revokeKey(generated.key.id, 'admin-id');
    const revokeLog = store.auditLogs.find((l) => l.action === 'KEY_REVOKE');
    expect(revokeLog).toBeDefined();
  });
});

// ─── Scenario 4: offboard user → all keys revoked ────────────────────────────

describe('Scenario 4: offboard user → all keys revoked', () => {
  let userId: string;
  let key1: GeneratedKey;
  let key2: GeneratedKey;

  beforeEach(async () => {
    const user = await usersService.create(
      { email: 'frank@example.com', fullName: 'Frank' },
      'admin-id',
    );
    userId = user.id;

    // Generate two keys (simulate rotation — user has both ACTIVE and ROTATING)
    key1 = await keysService.generateKey(userId, 'admin-id');
    key2 = await keysService.rotateKey(key1.key.id, 'admin-id');
  });

  it('user has ACTIVE and ROTATING keys before offboarding', () => {
    const userKeys = [...store.apiKeys.values()].filter((k) => k.userId === userId);
    const activeOrRotating = userKeys.filter(
      (k) => k.status === ApiKeyStatus.ACTIVE || k.status === ApiKeyStatus.ROTATING,
    );
    expect(activeOrRotating.length).toBeGreaterThanOrEqual(1);
  });

  it('offboarding revokes all ACTIVE and ROTATING keys', async () => {
    await usersService.offboard(userId, 'admin-id');

    const userKeys = [...store.apiKeys.values()].filter((k) => k.userId === userId);
    const stillActive = userKeys.filter(
      (k) => k.status === ApiKeyStatus.ACTIVE || k.status === ApiKeyStatus.ROTATING,
    );
    expect(stillActive.length).toBe(0);
  });

  it('offboarded user has OFFBOARDED status', async () => {
    await usersService.offboard(userId, 'admin-id');
    const user = store.users.get(userId);
    expect(user?.status).toBe(UserStatus.OFFBOARDED);
    expect(user?.offboardedAt).toBeInstanceOf(Date);
  });

  it('new key validation returns null after offboarding', async () => {
    await usersService.offboard(userId, 'admin-id');

    const result1 = await keysService.validateKey(key2.plaintext);
    expect(result1).toBeNull();
  });

  it('audit log includes USER_OFFBOARD action', async () => {
    await usersService.offboard(userId, 'admin-id');
    const offboardLog = store.auditLogs.find((l) => l.action === 'USER_OFFBOARD');
    expect(offboardLog).toBeDefined();
  });

  it('revokeAllUserKeys returns count of revoked keys', async () => {
    // Create a fresh user for this specific test
    const user = await usersService.create(
      { email: 'grace@example.com', fullName: 'Grace' },
      'admin-id',
    );
    await keysService.generateKey(user.id, 'admin-id');
    await keysService.generateKey(user.id, 'admin-id');

    const count = await keysService.revokeAllUserKeys(user.id, 'admin-id');
    expect(count).toBe(2);
  });
});

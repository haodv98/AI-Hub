import { Test, TestingModule } from '@nestjs/testing';
import { PoliciesService } from './policies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TeamMemberTier } from '@prisma/client';
import { EffectivePolicy } from './policies.types';

// ── Mock factories ────────────────────────────────────────────────────────────

const mockPrisma = () => ({
  policy: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  teamMember: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
});

const mockRedis = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  incr: jest.fn().mockResolvedValue(1),
});

// ── Policy builder helper ─────────────────────────────────────────────────────

function makePolicy(overrides: {
  id?: string;
  userId?: string | null;
  teamId?: string | null;
  tier?: TeamMemberTier | null;
  priority?: number;
  isActive?: boolean;
  allowedEngines?: string[];
  config?: object;
}) {
  return {
    id: overrides.id ?? 'p1',
    name: 'test-policy',
    description: null,
    userId: overrides.userId ?? null,
    teamId: overrides.teamId ?? null,
    tier: overrides.tier ?? null,
    priority: overrides.priority ?? 0,
    isActive: overrides.isActive ?? true,
    allowedEngines: overrides.allowedEngines ?? [],
    config: overrides.config ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PoliciesService', () => {
  let service: PoliciesService;
  let prisma: ReturnType<typeof mockPrisma>;
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoliciesService,
        { provide: PrismaService, useFactory: mockPrisma },
        { provide: RedisService, useFactory: mockRedis },
      ],
    }).compile();

    service = module.get(PoliciesService);
    prisma = module.get(PrismaService) as any;
    redis = module.get(RedisService) as any;
  });

  afterEach(() => jest.clearAllMocks());

  // ── CASE 1: No policies anywhere → system defaults ────────────────────────

  it('returns system defaults when no policies exist', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.resolvedFrom).toBe('system-default');
    expect(result.config.limits.rpm).toBe(10);
    expect(result.config.limits.monthlyBudgetUsd).toBe(20);
    expect(result.allowedEngines).toEqual([]);
  });

  // ── CASE 2: Org-default only (user has no team) ───────────────────────────

  it('uses org-default when user has no team membership', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue(null);
    const orgPolicy = makePolicy({
      allowedEngines: ['gpt-4'],
      config: { limits: { rpm: 20, dailyTokens: 50000, monthlyBudgetUsd: 30 } },
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([orgPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.resolvedFrom).toBe('org-default');
    expect(result.allowedEngines).toEqual(['gpt-4']);
    expect(result.config.limits.rpm).toBe(20);
    expect(result.config.limits.monthlyBudgetUsd).toBe(30);
  });

  // ── CASE 3: Field-level inheritance from org-default ─────────────────────
  // Team policy sets rpm; monthlyBudgetUsd should come from org-default

  it('inherits org-default fields not overridden by team policy', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const orgPolicy = makePolicy({
      id: 'org-1',
      config: { limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 50 } },
    });
    const teamPolicy = makePolicy({
      id: 'team-1',
      teamId: 'team-1',
      tier: null,
      config: { limits: { rpm: 30 } }, // only rpm set
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([orgPolicy, teamPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.config.limits.rpm).toBe(30); // from team
    expect(result.config.limits.monthlyBudgetUsd).toBe(50); // inherited from org
  });

  // ── CASE 4: Team overrides org for allowedEngines ────────────────────────

  it('team-level allowedEngines overrides org-default', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const orgPolicy = makePolicy({ allowedEngines: ['gpt-4', 'claude-3'] });
    const teamPolicy = makePolicy({
      id: 'team-p',
      teamId: 'team-1',
      allowedEngines: ['claude-3-haiku'],
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([orgPolicy, teamPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.allowedEngines).toEqual(['claude-3-haiku']);
    expect(result.resolvedFrom).toBe('team');
  });

  // ── CASE 5: Role-level overrides team for rpm ─────────────────────────────

  it('role-level rpm overrides team-level rpm', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.SENIOR,
    });
    const teamPolicy = makePolicy({
      id: 'team-p', teamId: 'team-1', tier: null,
      config: { limits: { rpm: 20, dailyTokens: 100000, monthlyBudgetUsd: 40 } },
    });
    const rolePolicy = makePolicy({
      id: 'role-p', teamId: 'team-1', tier: TeamMemberTier.SENIOR,
      config: { limits: { rpm: 60 } },
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([teamPolicy, rolePolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.config.limits.rpm).toBe(60); // from role
    expect(result.config.limits.monthlyBudgetUsd).toBe(40); // inherited from team
    expect(result.resolvedFrom).toBe('role');
  });

  // ── CASE 6: Individual overrides all for allowedEngines ──────────────────

  it('individual allowedEngines override all lower levels', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const orgPolicy = makePolicy({ allowedEngines: ['gpt-4'] });
    const teamPolicy = makePolicy({
      id: 'tp', teamId: 'team-1', allowedEngines: ['claude-3'],
    });
    const individualPolicy = makePolicy({
      id: 'ip', userId: 'user-1', allowedEngines: ['gpt-4', 'claude-3', 'gemini-pro'],
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([
      orgPolicy, teamPolicy, individualPolicy,
    ]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.allowedEngines).toEqual(['gpt-4', 'claude-3', 'gemini-pro']);
    expect(result.resolvedFrom).toBe('individual');
  });

  // ── CASE 7: Individual empty allowedEngines → unrestricted ───────────────
  // An individual override with [] means "allow all" and wins over team restriction

  it('individual empty allowedEngines overrides team restriction (allow all)', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const teamPolicy = makePolicy({
      id: 'tp', teamId: 'team-1', allowedEngines: ['gpt-4'],
    });
    const individualPolicy = makePolicy({
      id: 'ip', userId: 'user-1', allowedEngines: [], // empty = allow all
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([teamPolicy, individualPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.allowedEngines).toEqual([]);
    expect(result.resolvedFrom).toBe('individual');
  });

  // ── CASE 8: Inactive policy ignored ──────────────────────────────────────

  it('inactive policies are skipped and lower-level is used', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const orgPolicy = makePolicy({
      allowedEngines: ['gpt-4'],
      config: { limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 20 } },
    });
    // Individual exists but is inactive — DB query with isActive:true won't return it
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([orgPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.resolvedFrom).toBe('org-default');
    expect(result.allowedEngines).toEqual(['gpt-4']);
  });

  // ── CASE 9: Priority tiebreaker within same cascade level ─────────────────

  it('higher priority wins tiebreaker within same cascade level', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue(null);
    // Two org-default policies; higher priority (10) wins
    const lowPriority = makePolicy({
      id: 'low', priority: 0, allowedEngines: ['gpt-4'],
      config: { limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 30 } },
    });
    const highPriority = makePolicy({
      id: 'high', priority: 10, allowedEngines: ['claude-3'],
      config: { limits: { rpm: 60, dailyTokens: 100000, monthlyBudgetUsd: 100 } },
    });
    // Prisma returns ordered by priority DESC, so highPriority first
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([highPriority, lowPriority]);

    const result = await service.resolveEffectivePolicy('user-1');

    // High priority org policy is chosen (first in orgDefault list)
    expect(result.config.limits.rpm).toBe(60);
    expect(result.allowedEngines).toEqual(['claude-3']);
  });

  // ── CASE 10: Role policy for different tier does not match ────────────────

  it('role policy for different tier does not apply to user', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const teamPolicy = makePolicy({
      id: 'tp', teamId: 'team-1', tier: null,
      config: { limits: { rpm: 20, dailyTokens: 100000, monthlyBudgetUsd: 40 } },
    });
    // LEAD role policy — should not apply to MEMBER user (DB filter handles this)
    // We simulate DB returning only the team policy (not the LEAD role policy)
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([teamPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.resolvedFrom).toBe('team');
    expect(result.config.limits.rpm).toBe(20);
  });

  // ── CASE 11: Individual overrides even with lower priority number ─────────

  it('individual level always wins over team regardless of priority numbers', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const teamPolicy = makePolicy({
      id: 'tp', teamId: 'team-1', priority: 999,
      allowedEngines: ['gpt-4'],
      config: { limits: { rpm: 999, dailyTokens: 999999, monthlyBudgetUsd: 999 } },
    });
    const individualPolicy = makePolicy({
      id: 'ip', userId: 'user-1', priority: 1,
      allowedEngines: ['claude-3'],
      config: { limits: { rpm: 5 } },
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([teamPolicy, individualPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    // Individual always wins the cascade level
    expect(result.resolvedFrom).toBe('individual');
    expect(result.allowedEngines).toEqual(['claude-3']);
    expect(result.config.limits.rpm).toBe(5);
    // monthlyBudgetUsd inherited from team since individual doesn't set it
    expect(result.config.limits.monthlyBudgetUsd).toBe(999);
  });

  // ── CASE 12: Full 4-level cascade field merge ─────────────────────────────

  it('correctly merges fields from all four cascade levels independently', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.SENIOR,
    });
    const orgPolicy = makePolicy({
      id: 'org',
      config: { limits: { rpm: 10, dailyTokens: 50000, monthlyBudgetUsd: 20 } },
    });
    const teamPolicy = makePolicy({
      id: 'tp', teamId: 'team-1', tier: null,
      config: { limits: { monthlyBudgetUsd: 80 } }, // overrides only budget
    });
    const rolePolicy = makePolicy({
      id: 'rp', teamId: 'team-1', tier: TeamMemberTier.SENIOR,
      config: { limits: { dailyTokens: 200000 } }, // overrides only dailyTokens
    });
    const individualPolicy = makePolicy({
      id: 'ip', userId: 'user-1',
      config: { limits: { rpm: 120 } }, // overrides only rpm
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([
      orgPolicy, teamPolicy, rolePolicy, individualPolicy,
    ]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.config.limits.rpm).toBe(120); // from individual
    expect(result.config.limits.dailyTokens).toBe(200000); // from role
    expect(result.config.limits.monthlyBudgetUsd).toBe(80); // from team
    expect(result.resolvedFrom).toBe('individual');
  });

  // ── CASE 13: Cache hit returns without DB query ───────────────────────────

  it('returns cached result without querying database on cache hit', async () => {
    const cached: EffectivePolicy = {
      allowedEngines: ['gpt-4'],
      config: { limits: { rpm: 30, dailyTokens: 50000, monthlyBudgetUsd: 60 } },
      resolvedFrom: 'team',
    };
    // First get() returns orgVersion '0', second get() returns cached policy
    (redis.get as jest.Mock)
      .mockResolvedValueOnce('0')          // orgVersion
      .mockResolvedValueOnce(JSON.stringify(cached)); // user cache hit

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result).toEqual(cached);
    expect(prisma.teamMember.findFirst).not.toHaveBeenCalled();
    expect(prisma.policy.findMany).not.toHaveBeenCalled();
  });

  // ── CASE 14: Cache miss populates cache with versioned key ────────────────

  it('writes computed result to cache with versioned key on cache miss', async () => {
    (redis.get as jest.Mock)
      .mockResolvedValueOnce('0')  // orgVersion
      .mockResolvedValueOnce(null); // cache miss
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([]);

    await service.resolveEffectivePolicy('user-1');

    expect(redis.set).toHaveBeenCalledWith(
      'policy:resolved:user:user-1:v0',
      expect.any(String),
      300,
    );
  });

  // ── CASE 15: Redis down → falls back gracefully ───────────────────────────

  it('resolves policy correctly when Redis is unavailable', async () => {
    (redis.get as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED')); // orgVersion fetch fails
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue(null);
    const orgPolicy = makePolicy({
      allowedEngines: ['gpt-4'],
      config: { limits: { rpm: 15, dailyTokens: 100000, monthlyBudgetUsd: 25 } },
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([orgPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.resolvedFrom).toBe('org-default');
    expect(result.config.limits.rpm).toBe(15);
  });

  // ── CASE 16: Fallback config propagation ─────────────────────────────────

  it('correctly propagates fallback config from policy', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue(null);
    const orgPolicy = makePolicy({
      config: {
        limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 50 },
        fallback: { thresholdPct: 90, fromModel: 'gpt-4', toModel: 'gpt-3.5-turbo' },
      },
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([orgPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.config.fallback).toEqual({
      thresholdPct: 90,
      fromModel: 'gpt-4',
      toModel: 'gpt-3.5-turbo',
    });
  });

  // ── CASE 17: Individual removes fallback set by team ─────────────────────

  it('individual policy with null fallback removes team fallback', async () => {
    (prisma.teamMember.findFirst as jest.Mock).mockResolvedValue({
      teamId: 'team-1', tier: TeamMemberTier.MEMBER,
    });
    const teamPolicy = makePolicy({
      id: 'tp', teamId: 'team-1',
      config: {
        limits: { rpm: 20, dailyTokens: 100000, monthlyBudgetUsd: 40 },
        fallback: { thresholdPct: 80, fromModel: 'gpt-4', toModel: 'gpt-3.5-turbo' },
      },
    });
    const individualPolicy = makePolicy({
      id: 'ip', userId: 'user-1',
      config: { limits: { rpm: 60 }, fallback: null }, // explicitly removes fallback
    });
    (prisma.policy.findMany as jest.Mock).mockResolvedValue([teamPolicy, individualPolicy]);

    const result = await service.resolveEffectivePolicy('user-1');

    expect(result.config.fallback).toBeUndefined();
  });

  // ── CASE 18: simulate() - model not in allowedEngines ────────────────────

  it('simulate returns allowed=false when model not in allowedEngines', async () => {
    jest.spyOn(service, 'resolveEffectivePolicy').mockResolvedValue({
      allowedEngines: ['gpt-4'],
      config: { limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 50 } },
      resolvedFrom: 'org-default',
    });

    const result = await service.simulate('user-1', 'claude-3-opus', 0);

    expect(result.allowed).toBe(false);
    expect(result.fallbackApplied).toBe(false);
  });

  // ── CASE 19: simulate() - budget exceeded ────────────────────────────────

  it('simulate returns allowed=false when budget is fully consumed', async () => {
    jest.spyOn(service, 'resolveEffectivePolicy').mockResolvedValue({
      allowedEngines: [],
      config: { limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 50 } },
      resolvedFrom: 'org-default',
    });

    const result = await service.simulate('user-1', 'gpt-4', 50); // cost = cap

    expect(result.allowed).toBe(false);
    expect(result.budgetRemaining).toBe(0);
  });

  // ── CASE 20: simulate() - fallback applied ───────────────────────────────

  it('simulate applies fallback model when threshold is reached', async () => {
    jest.spyOn(service, 'resolveEffectivePolicy').mockResolvedValue({
      allowedEngines: [],
      config: {
        limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 100 },
        fallback: { thresholdPct: 80, fromModel: 'gpt-4', toModel: 'gpt-3.5-turbo' },
      },
      resolvedFrom: 'team',
    });

    const result = await service.simulate('user-1', 'gpt-4', 85); // 85% used > 80% threshold

    expect(result.fallbackApplied).toBe(true);
    expect(result.fallbackModel).toBe('gpt-3.5-turbo');
    expect(result.allowed).toBe(true); // still allowed (not 100% yet)
  });

  // ── CASE 21: simulate() - zero budget cap means unlimited ────────────────

  it('simulate allows request when monthlyBudgetUsd is 0 (unlimited)', async () => {
    jest.spyOn(service, 'resolveEffectivePolicy').mockResolvedValue({
      allowedEngines: [],
      config: { limits: { rpm: 10, dailyTokens: 100000, monthlyBudgetUsd: 0 } },
      resolvedFrom: 'org-default',
    });

    const result = await service.simulate('user-1', 'gpt-4', 9999);

    expect(result.allowed).toBe(true); // 0 cap = unlimited
  });

  // ── CASE 22: create() org-default policy increments version counter ─────────

  it('increments org version counter when creating org-default policy', async () => {
    (prisma.policy.create as jest.Mock).mockResolvedValue(
      makePolicy({ id: 'new-p' }), // no userId, no teamId = org-default
    );
    (redis.get as jest.Mock).mockResolvedValue('2'); // current orgVersion

    await service.create({ name: 'org-policy' });

    expect(redis.incr).toHaveBeenCalledWith('policy:org:version');
  });

  // ── CASE 23: create() invalidates individual user cache across versions ────

  it('deletes versioned cache entries for individual policy user', async () => {
    (prisma.policy.create as jest.Mock).mockResolvedValue(
      makePolicy({ id: 'new-p', userId: 'user-1' }),
    );
    (redis.get as jest.Mock).mockResolvedValue('1'); // orgVersion = 1

    await service.create({
      name: 'individual-policy',
      userId: 'user-1',
      allowedEngines: ['gpt-4'],
    });

    // Should delete v0 and v1 for user-1
    expect(redis.del).toHaveBeenCalledWith('policy:resolved:user:user-1:v0');
    expect(redis.del).toHaveBeenCalledWith('policy:resolved:user:user-1:v1');
  });
});

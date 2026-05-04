import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Policy, TeamMemberTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  EffectivePolicy,
  PolicyConfig,
  PolicyResolvedFrom,
  SimulateResult,
} from './policies.types';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

const CACHE_TTL_SECONDS = 300; // 5 minutes
const ORG_VERSION_KEY = 'policy:org:version';

const SYSTEM_DEFAULT_POLICY: EffectivePolicy = {
  allowedEngines: [],
  config: {
    limits: { rpm: 10, dailyTokens: 100_000, monthlyBudgetUsd: 20 },
  },
  resolvedFrom: 'system-default',
};

@Injectable()
export class PoliciesService {
  private readonly logger = new Logger(PoliciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreatePolicyDto): Promise<Policy> {
    try {
      const policy = await this.prisma.policy.create({
        data: {
          name: dto.name,
          description: dto.description,
          teamId: dto.teamId ?? null,
          tier: dto.tier ?? null,
          userId: dto.userId ?? null,
          priority: dto.priority ?? 0,
          isActive: dto.isActive ?? true,
          allowedEngines: dto.allowedEngines ?? [],
          config: (dto.config as object) ?? {},
        },
      });
      await this.invalidateAffectedCaches(policy);
      return policy;
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') throw new ConflictException('Policy name already exists');
      throw err;
    }
  }

  async findAll(filters?: {
    teamId?: string;
    userId?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ policies: Policy[]; total: number }> {
    const page  = filters?.page  ?? 1;
    const limit = Math.min(filters?.limit ?? 20, 100);
    const order = filters?.sortOrder ?? 'desc';
    const validSort = ['priority', 'name', 'createdAt', 'updatedAt'];
    const sortBy = validSort.includes(filters?.sortBy ?? '') ? filters!.sortBy! : 'priority';

    const where = {
      ...(filters?.teamId   !== undefined ? { teamId: filters.teamId }     : {}),
      ...(filters?.userId   !== undefined ? { userId: filters.userId }     : {}),
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters?.search   ? { name: { contains: filters.search, mode: 'insensitive' as const } } : {}),
    };

    const [policies, total] = await Promise.all([
      this.prisma.policy.findMany({
        where,
        orderBy: [{ [sortBy]: order }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.policy.count({ where }),
    ]);
    return { policies, total };
  }

  async findById(id: string): Promise<Policy> {
    const policy = await this.prisma.policy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  async update(id: string, dto: UpdatePolicyDto): Promise<Policy> {
    await this.findById(id); // throws 404 if not found

    const policy = await this.prisma.policy.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
        ...(dto.tier !== undefined ? { tier: dto.tier } : {}),
        ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.allowedEngines !== undefined ? { allowedEngines: dto.allowedEngines } : {}),
        ...(dto.config !== undefined ? { config: dto.config as object } : {}),
      },
    });
    await this.invalidateAffectedCaches(policy);
    return policy;
  }

  async remove(id: string): Promise<void> {
    const policy = await this.findById(id);
    await this.prisma.policy.delete({ where: { id } });
    await this.invalidateAffectedCaches(policy);
  }

  // ── Cascade Resolution ────────────────────────────────────────────────────

  async resolveEffectivePolicy(userId: string): Promise<EffectivePolicy> {
    try {
      // Org-version counter: incremented on any org-default policy change.
      // Including it in the cache key makes org-default changes atomically invalidate
      // all user caches without needing to enumerate every user.
      const orgVersion = await this.redis.get(ORG_VERSION_KEY) ?? '0';
      const cacheKey = `policy:resolved:user:${userId}:v${orgVersion}`;

      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as EffectivePolicy;

      const result = await this.computeEffectivePolicy(userId);
      await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
      return result;
    } catch {
      // Redis unavailable: compute without cache
    }

    return this.computeEffectivePolicy(userId);
  }

  private async computeEffectivePolicy(userId: string): Promise<EffectivePolicy> {
    const membership = await this.prisma.teamMember.findFirst({
      where: { userId, isPrimary: true },
      orderBy: { joinedAt: 'asc' }, // deterministic if uniqueness constraint is missing
    });

    const teamId = membership?.teamId ?? null;
    const tier = membership?.tier ?? null;

    // Build OR conditions: individual, role-level (if team+tier), team-level (if team), org-default
    const conditions: object[] = [
      { userId, isActive: true },
      { teamId: null, tier: null, userId: null, isActive: true },
    ];

    if (teamId) {
      conditions.push({ teamId, tier: null, userId: null, isActive: true });
      if (tier) {
        conditions.push({ teamId, tier, userId: null, isActive: true });
      }
    }

    const policies = await this.prisma.policy.findMany({
      where: { OR: conditions },
      orderBy: { priority: 'desc' },
    });

    const individual = policies.filter((p) => p.userId === userId);
    const roleLevel = teamId && tier
      ? policies.filter((p) => p.teamId === teamId && p.tier === tier && p.userId === null)
      : [];
    const teamLevel = teamId
      ? policies.filter((p) => p.teamId === teamId && p.tier === null && p.userId === null)
      : [];
    const orgDefault = policies.filter((p) => p.teamId === null && p.tier === null && p.userId === null);

    // Build ordered layers: lowest priority first, highest last (so each layer overrides previous)
    const layers: { policy: Policy; level: PolicyResolvedFrom }[] = [];
    if (orgDefault[0]) layers.push({ policy: orgDefault[0], level: 'org-default' });
    if (teamLevel[0]) layers.push({ policy: teamLevel[0], level: 'team' });
    if (roleLevel[0]) layers.push({ policy: roleLevel[0], level: 'role' });
    if (individual[0]) layers.push({ policy: individual[0], level: 'individual' });

    if (layers.length === 0) return { ...SYSTEM_DEFAULT_POLICY };

    return this.mergeLayers(layers);
  }

  private mergeLayers(
    layers: { policy: Policy; level: PolicyResolvedFrom }[],
  ): EffectivePolicy {
    // Start from system defaults; each layer overrides per field
    const merged: EffectivePolicy = {
      allowedEngines: [],
      config: {
        limits: { ...SYSTEM_DEFAULT_POLICY.config.limits },
      },
      resolvedFrom: layers[0].level,
    };

    for (const { policy, level } of layers) {
      // allowedEngines: higher priority always wins (empty = allow all is a valid value)
      merged.allowedEngines = policy.allowedEngines;
      merged.resolvedFrom = level;

      const cfg = policy.config as Partial<PolicyConfig> | null;
      if (!cfg) continue;

      if (cfg.limits) {
        merged.config = { ...merged.config, limits: { ...merged.config.limits } };
        if (cfg.limits.rpm !== undefined) merged.config.limits.rpm = cfg.limits.rpm;
        if (cfg.limits.dailyTokens !== undefined) merged.config.limits.dailyTokens = cfg.limits.dailyTokens;
        if (cfg.limits.monthlyBudgetUsd !== undefined) {
          merged.config.limits.monthlyBudgetUsd = cfg.limits.monthlyBudgetUsd;
        }
      }

      // fallback: higher priority wins if explicitly set (undefined = not set, null = remove)
      if ('fallback' in cfg) {
        merged.config = { ...merged.config, fallback: cfg.fallback ?? undefined };
      }
    }

    return merged;
  }

  // ── Simulate ──────────────────────────────────────────────────────────────

  async simulate(userId: string, model: string, currentCostUsd = 0): Promise<SimulateResult> {
    const effectivePolicy = await this.resolveEffectivePolicy(userId);
    const { allowedEngines, config } = effectivePolicy;

    const modelAllowed =
      allowedEngines.length === 0 || allowedEngines.includes(model);

    const budgetCap = config.limits.monthlyBudgetUsd;
    const budgetPct = budgetCap > 0 ? (currentCostUsd / budgetCap) * 100 : 0;
    const fallback = config.fallback;

    let fallbackApplied = false;
    let fallbackModel: string | null = null;

    if (
      fallback &&
      budgetPct >= fallback.thresholdPct &&
      fallback.fromModel === model &&
      fallback.toModel
    ) {
      fallbackApplied = true;
      fallbackModel = fallback.toModel;
    }

    const budgetExceeded = budgetCap > 0 && currentCostUsd >= budgetCap;

    return {
      allowed: modelAllowed && !budgetExceeded,
      fallbackApplied,
      fallbackModel,
      budgetRemaining: Math.max(0, budgetCap - currentCostUsd),
      rateLimit: config.limits.rpm,
      effectivePolicy,
    };
  }

  // ── Cache Invalidation ────────────────────────────────────────────────────

  private async invalidateAffectedCaches(policy: Policy): Promise<void> {
    try {
      if (policy.userId) {
        // Individual policy: delete all versioned cache keys for that user.
        // Since we don't track which version each user has, we get the current orgVersion
        // and delete keys for versions 0..current (bounded, typically only 1–2 exist).
        const orgVersion = parseInt(await this.redis.get(ORG_VERSION_KEY) ?? '0', 10);
        for (let v = 0; v <= orgVersion; v++) {
          await this.redis.del(`policy:resolved:user:${policy.userId}:v${v}`).catch(() => {});
        }
      } else if (policy.teamId) {
        // Team/role policy: invalidate all team members across all current version slots
        await this.invalidateTeamMemberCaches(policy.teamId);
      } else {
        // Org-default changed: increment the org-version counter.
        // All existing user cache keys use the old version and become unreachable —
        // they will expire naturally within CACHE_TTL_SECONDS (5min).
        await this.redis.incr(ORG_VERSION_KEY);
        this.logger.log('Org-default policy changed — incremented org cache version');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Cache invalidation failed: ${message}`);
    }
  }

  async invalidateTeamMemberCaches(teamId: string): Promise<void> {
    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });
    const orgVersion = parseInt(await this.redis.get(ORG_VERSION_KEY) ?? '0', 10);
    await Promise.all(
      members.flatMap((m) =>
        Array.from({ length: orgVersion + 1 }, (_, v) =>
          this.redis.del(`policy:resolved:user:${m.userId}:v${v}`).catch(() => {}),
        ),
      ),
    );
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ResolveContext, ResolveResult } from './model-router.types';

function globMatch(str: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(str);
}

const CACHE_TTL_SECONDS = 300;

type AliasRow = {
  id: string;
  fromPattern: string;
  toProviderModel: string;
  scope: string;
  scopeId: string | null;
  priority: number;
  createdAt: Date;
};

@Injectable()
export class ModelAliasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async resolveAlias(model: string, ctx: ResolveContext): Promise<ResolveResult> {
    const levels = [
      { scope: 'KEY' as const, scopeId: ctx.apiKeyId },
      { scope: 'TEAM' as const, scopeId: ctx.teamId ?? null },
      { scope: 'ORG' as const, scopeId: null },
    ];

    for (const level of levels) {
      if (!level.scopeId && level.scope !== 'ORG') continue;

      const aliases = await this.getAliases(level.scope, level.scopeId);
      const match = this.findMatch(aliases, model);

      if (match) {
        const isCombo = match.toProviderModel.startsWith('COMBO:');
        return {
          providerModel: match.toProviderModel,
          matchedAlias: {
            id: match.id,
            fromPattern: match.fromPattern,
            scope: match.scope,
            priority: match.priority,
          },
          comboName: isCombo ? match.toProviderModel.slice(6) : undefined,
          isPassthrough: false,
        };
      }
    }

    if (model.includes('/')) {
      return { providerModel: model, isPassthrough: true };
    }

    throw new BadRequestException(
      `No alias found for model "${model}" and it is not in "provider/model" format`,
    );
  }

  async invalidateCache(scope: string, scopeId: string | null): Promise<void> {
    await this.redis.del(`aliases:${scope}:${scopeId ?? 'null'}`);
  }

  private async getAliases(scope: string, scopeId: string | null): Promise<AliasRow[]> {
    const cacheKey = `aliases:${scope}:${scopeId ?? 'null'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as AliasRow[];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.prisma as any).modelAlias.findMany({
      where: { scope, scopeId, isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    }) as AliasRow[];

    await this.redis.set(cacheKey, JSON.stringify(rows), CACHE_TTL_SECONDS);
    return rows;
  }

  private findMatch(aliases: AliasRow[], model: string): AliasRow | null {
    const exact = aliases.find(a => a.fromPattern === model);
    if (exact) return exact;
    return aliases.find(a => globMatch(model, a.fromPattern)) ?? null;
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolveContext, ResolveResult } from './model-router.types';

// TODO: install minimatch@9 when implementing TASK-403
function globMatch(str: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(str);
}

const CACHE_TTL_SECONDS = 300;

@Injectable()
export class ModelAliasService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAlias(model: string, ctx: ResolveContext): Promise<ResolveResult> {
    const levels = [
      { scope: 'KEY' as const, scopeId: ctx.apiKeyId },
      { scope: 'TEAM' as const, scopeId: ctx.teamId ?? null },
      { scope: 'ORG' as const, scopeId: null },
    ];

    for (const level of levels) {
      if (!level.scopeId && level.scope !== 'ORG') continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aliases = await (this.prisma as any).modelAlias.findMany({
        where: {
          scope: level.scope,
          scopeId: level.scopeId,
          isActive: true,
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });

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

    // Passthrough: input must already be in "provider/model" format
    if (model.includes('/')) {
      return { providerModel: model, isPassthrough: true };
    }

    throw new BadRequestException(
      `No alias found for model "${model}" and it is not in "provider/model" format`,
    );
  }

  async invalidateCache(scope: string, scopeId: string | null): Promise<void> {
    // Redis cache invalidation — inject RedisService when available
    // Key pattern: aliases:<scope>:<scopeId>:*
    // Placeholder for Sprint 1 TASK-403
  }

  private findMatch(
    aliases: { id: string; fromPattern: string; toProviderModel: string; scope: string; priority: number }[],
    model: string,
  ) {
    // Exact match first
    const exact = aliases.find(a => a.fromPattern === model);
    if (exact) return exact;

    // Glob match
    return aliases.find(a => globMatch(model, a.fromPattern)) ?? null;
  }
}

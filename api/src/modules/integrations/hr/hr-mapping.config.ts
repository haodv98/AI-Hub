import { TeamMemberTier } from '@prisma/client';

export interface HrMappingRule {
  dept: string;
  team: string;
  defaultTier: TeamMemberTier;
}

export const HR_DEFAULT_MAPPING: HrMappingRule[] = [
  { dept: 'engineering - frontend', team: 'frontend', defaultTier: TeamMemberTier.MEMBER },
  { dept: 'engineering - backend', team: 'backend', defaultTier: TeamMemberTier.MEMBER },
  { dept: 'devops', team: 'devops', defaultTier: TeamMemberTier.MEMBER },
  { dept: 'product', team: 'product', defaultTier: TeamMemberTier.MEMBER },
];

export function loadHrMappingFromEnv(raw?: string): HrMappingRule[] {
  if (!raw?.trim()) {
    return HR_DEFAULT_MAPPING;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return HR_DEFAULT_MAPPING;
    }

    const normalized = parsed
      .map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return null;
        const data = entry as Record<string, unknown>;
        const dept = typeof data.dept === 'string' ? data.dept.trim().toLowerCase() : '';
        const team = typeof data.team === 'string' ? data.team.trim() : '';
        const defaultTier = normalizeTier(data.defaultTier);
        if (!dept || !team || !defaultTier) return null;
        return { dept, team, defaultTier };
      })
      .filter((item): item is HrMappingRule => item !== null);

    return normalized.length > 0 ? normalized : HR_DEFAULT_MAPPING;
  } catch {
    return HR_DEFAULT_MAPPING;
  }
}

export function resolveTierFromTitle(title: string | null | undefined): TeamMemberTier | null {
  const normalized = (title ?? '').toLowerCase();
  if (normalized.includes('lead') || normalized.includes('manager')) return TeamMemberTier.LEAD;
  if (normalized.includes('senior')) return TeamMemberTier.SENIOR;
  return null;
}

function normalizeTier(value: unknown): TeamMemberTier | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === TeamMemberTier.LEAD) return TeamMemberTier.LEAD;
  if (normalized === TeamMemberTier.SENIOR) return TeamMemberTier.SENIOR;
  if (normalized === TeamMemberTier.MEMBER) return TeamMemberTier.MEMBER;
  return null;
}

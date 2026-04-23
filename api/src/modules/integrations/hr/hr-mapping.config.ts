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

export function resolveTierFromTitle(title: string | null | undefined): TeamMemberTier | null {
  const normalized = (title ?? '').toLowerCase();
  if (normalized.includes('lead') || normalized.includes('manager')) return TeamMemberTier.LEAD;
  if (normalized.includes('senior')) return TeamMemberTier.SENIOR;
  return null;
}

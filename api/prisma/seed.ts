import {
  PrismaClient,
  UserRole,
  UserStatus,
  TeamMemberTier,
  ProviderType,
  ProviderKeyScope,
} from '@prisma/client';

const prisma = new PrismaClient();
const log = (step: string, msg: string) => console.log(`[seed] ${step.padEnd(16)} ${msg}`);

async function main() {
  console.log('\n── Seeding dev database ────────────────────────────────────');

  // ── Teams ────────────────────────────────────────────────────────────────
  log('teams', 'upserting...');
  const [teamFrontend, teamBackend, teamHR] = await Promise.all([
    prisma.team.upsert({
      where: { name: 'Frontend' },
      update: {},
      create: { name: 'Frontend', description: 'Frontend Engineering team', monthlyBudgetUsd: 500 },
    }),
    prisma.team.upsert({
      where: { name: 'Backend' },
      update: {},
      create: { name: 'Backend', description: 'Backend Engineering team', monthlyBudgetUsd: 800 },
    }),
    prisma.team.upsert({
      where: { name: 'HR' },
      update: {},
      create: { name: 'HR', description: 'Human Resources', monthlyBudgetUsd: 200 },
    }),
  ]);
  log('teams', `✓  Frontend(${teamFrontend.id.slice(0, 8)}) Backend(${teamBackend.id.slice(0, 8)}) HR(${teamHR.id.slice(0, 8)})`);

  // ── Users ────────────────────────────────────────────────────────────────
  log('users', 'upserting...');
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'it.admin@company.com' },
      update: {},
      create: { email: 'it.admin@company.com', fullName: 'IT Admin', role: UserRole.IT_ADMIN, status: UserStatus.ACTIVE },
    }),
    prisma.user.upsert({
      where: { email: 'fe.lead@company.com' },
      update: {},
      create: { email: 'fe.lead@company.com', fullName: 'FE Lead', role: UserRole.TEAM_LEAD, status: UserStatus.ACTIVE },
    }),
    prisma.user.upsert({
      where: { email: 'fe.dev@company.com' },
      update: {},
      create: { email: 'fe.dev@company.com', fullName: 'FE Developer', role: UserRole.MEMBER, status: UserStatus.ACTIVE },
    }),
    prisma.user.upsert({
      where: { email: 'be.lead@company.com' },
      update: {},
      create: { email: 'be.lead@company.com', fullName: 'BE Lead', role: UserRole.TEAM_LEAD, status: UserStatus.ACTIVE },
    }),
    prisma.user.upsert({
      where: { email: 'be.dev@company.com' },
      update: {},
      create: { email: 'be.dev@company.com', fullName: 'BE Developer', role: UserRole.MEMBER, status: UserStatus.ACTIVE },
    }),
    prisma.user.upsert({
      where: { email: 'hr.member@company.com' },
      update: {},
      create: { email: 'hr.member@company.com', fullName: 'HR Specialist', role: UserRole.MEMBER, status: UserStatus.ACTIVE },
    }),
  ]);
  log('users', `✓  ${users.map((u) => u.email.split('@')[0]).join(', ')}`);

  const [, feLead, feDev, beLead, beDev, hrMember] = users;

  // ── TeamMembers ──────────────────────────────────────────────────────────
  log('team_members', 'upserting...');
  await Promise.all([
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: feLead.id, teamId: teamFrontend.id } },
      update: {},
      create: { userId: feLead.id, teamId: teamFrontend.id, tier: TeamMemberTier.LEAD },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: feDev.id, teamId: teamFrontend.id } },
      update: {},
      create: { userId: feDev.id, teamId: teamFrontend.id, tier: TeamMemberTier.MEMBER },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: beLead.id, teamId: teamBackend.id } },
      update: {},
      create: { userId: beLead.id, teamId: teamBackend.id, tier: TeamMemberTier.LEAD },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: beDev.id, teamId: teamBackend.id } },
      update: {},
      create: { userId: beDev.id, teamId: teamBackend.id, tier: TeamMemberTier.MEMBER },
    }),
    prisma.teamMember.upsert({
      where: { userId_teamId: { userId: hrMember.id, teamId: teamHR.id } },
      update: {},
      create: { userId: hrMember.id, teamId: teamHR.id, tier: TeamMemberTier.MEMBER },
    }),
  ]);
  log('team_members', '✓  5 memberships');

  // ── Policies ─────────────────────────────────────────────────────────────
  log('policies', 'upserting...');
  await prisma.policy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Org Default',
      description: 'Default policy for all users',
      teamId: null,
      tier: null,
      userId: null,
      priority: 0,
      allowedEngines: ['claude-haiku-4-5-20251001', 'gpt-4o-mini'],
      config: {
        limits: { rpm: 10, dailyTokens: 50000, monthlyBudgetUsd: 20 },
        fallback: { thresholdPct: 90, fromModel: null, toModel: null },
      },
    },
  });
  await prisma.policy.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Backend Team Policy',
      description: 'Enhanced policy for Backend team',
      teamId: teamBackend.id,
      tier: null,
      userId: null,
      priority: 10,
      allowedEngines: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'gpt-4o'],
      config: {
        limits: { rpm: 30, dailyTokens: 200000, monthlyBudgetUsd: 100 },
        fallback: { thresholdPct: 90, fromModel: 'claude-sonnet-4-6', toModel: 'claude-haiku-4-5-20251001' },
      },
    },
  });
  log('policies', '✓  org-default + backend-team');

  // ── Provider Keys (PER_SEAT + SHARED) ─────────────────────────────────────
  log('provider_keys', 'refreshing...');
  // Backward-compat fix: some reset DBs still keep legacy unique(provider) constraint.
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "provider_keys" DROP CONSTRAINT IF EXISTS "provider_keys_provider_key";',
  );
  await prisma.$executeRawUnsafe(
    'DROP INDEX IF EXISTS "provider_keys_provider_key";',
  );
  await prisma.providerKey.deleteMany({});

  const sharedKeys = [
    {
      provider: ProviderType.ANTHROPIC,
      scope: ProviderKeyScope.SHARED,
      userId: null,
      vaultPath: 'kv/aihub/providers/anthropic/shared',
      isActive: true,
    },
    {
      provider: ProviderType.OPENAI,
      scope: ProviderKeyScope.SHARED,
      userId: null,
      vaultPath: 'kv/aihub/providers/openai/shared',
      isActive: true,
    },
    {
      provider: ProviderType.GOOGLE,
      scope: ProviderKeyScope.SHARED,
      userId: null,
      vaultPath: 'kv/aihub/providers/google/shared',
      isActive: true,
    },
  ] as const;

  const perSeatKeys = [
    {
      provider: ProviderType.ANTHROPIC,
      scope: ProviderKeyScope.PER_SEAT,
      userId: feLead.id,
      vaultPath: `kv/aihub/providers/anthropic/users/${feLead.id}`,
      isActive: true,
    },
    {
      provider: ProviderType.ANTHROPIC,
      scope: ProviderKeyScope.PER_SEAT,
      userId: beLead.id,
      vaultPath: `kv/aihub/providers/anthropic/users/${beLead.id}`,
      isActive: true,
    },
    {
      provider: ProviderType.OPENAI,
      scope: ProviderKeyScope.PER_SEAT,
      userId: feDev.id,
      vaultPath: `kv/aihub/providers/openai/users/${feDev.id}`,
      isActive: true,
    },
    {
      provider: ProviderType.OPENAI,
      scope: ProviderKeyScope.PER_SEAT,
      userId: beDev.id,
      vaultPath: `kv/aihub/providers/openai/users/${beDev.id}`,
      isActive: true,
    },
  ] as const;

  await prisma.providerKey.createMany({
    data: [...sharedKeys, ...perSeatKeys],
  });
  log('provider_keys', '✓  SHARED(3) + PER_SEAT(4)');

  console.log('────────────────────────────────────────────────────────────');
  console.log('[seed] Done.');
  console.log('');
}

main()
  .catch((err: unknown) => {
    console.error('[seed] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

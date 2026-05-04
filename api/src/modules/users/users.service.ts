import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KeysService } from '../keys/keys.service';
import { ProviderTestService, TestConnectionResult } from './provider-test.service';
import { User, UserStatus, UserRole, ProviderType, TeamMemberTier } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';
import { VaultService } from '../../vault/vault.service';
import { EmailService } from '../integrations/email/email.service';

export class CreateUserDto {
  @ApiProperty({ example: 'dev@company.com' })
  @IsEmail() email: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString() @IsNotEmpty() fullName: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.MEMBER })
  @IsEnum(UserRole) @IsOptional() role?: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsString() @IsNotEmpty() @IsOptional() fullName?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole) @IsOptional() role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus) @IsOptional() status?: UserStatus;
}

export class AssignPerSeatKeyDto {
  @ApiProperty({ enum: ProviderType })
  @IsEnum(ProviderType)
  provider: ProviderType;

  @ApiProperty({ example: 'sk-ant-api03-xxx' })
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @ApiPropertyOptional({ description: 'Required when provider is OTHER', example: 'https://api.your-gateway.com' })
  @IsOptional()
  @ValidateIf((o: AssignPerSeatKeyDto) => o.provider === ProviderType.OTHER)
  @IsNotEmpty({ message: 'gatewayUrl is required when provider is OTHER' })
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  gatewayUrl?: string;
}

export interface BulkImportPerSeatResult {
  success: number;
  errors: Array<{ row: number; reason: string }>;
  issuedApiKeys: Array<{ email: string; apiKey: string }>;
}

export interface BulkImportUsersResult {
  success: number;
  errors: Array<{ row: number; reason: string }>;
  deliveryQueued: number;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
    private readonly vault: VaultService,
    private readonly email: EmailService,
    private readonly providerTest: ProviderTestService,
  ) {}

  async findAll(opts: {
    page: number;
    limit: number;
    status?: UserStatus;
    role?: UserRole;
    teamId?: string;
  }): Promise<{ users: User[]; total: number }> {
    const where = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.role ? { role: opts.role } : {}),
      ...(opts.teamId ? { teamMembers: { some: { teamId: opts.teamId } } } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          teamMembers: { include: { team: true } },
          apiKeys: {
            where: { status: { in: ['ACTIVE', 'ROTATING'] } },
            select: { lastUsedAt: true },
            orderBy: { lastUsedAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        teamMembers: { include: { team: true } },
        apiKeys: { where: { status: { in: ['ACTIVE', 'ROTATING'] } } },
        providerKeys: {
          where: { scope: 'PER_SEAT', isActive: true },
          select: { provider: true, scope: true, vaultPath: true, assignedAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, actorId: string): Promise<User> {
    const user = await this.prisma.user.create({
      data: { email: dto.email, fullName: dto.fullName, role: dto.role || UserRole.MEMBER },
    });

    this.audit.log({ actorId, action: 'USER_CREATE', targetType: 'User', targetId: user.id, details: { email: user.email } });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<User> {
    await this.findById(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    this.audit.log({ actorId, action: 'USER_UPDATE', targetType: 'User', targetId: id, details: dto as any });
    return user;
  }

  async offboard(id: string, actorId: string): Promise<User> {
    const user = await this.findById(id);

    // Revoke all keys
    await this.keys.revokeAllUserKeys(id, actorId);
    await this.prisma.providerKey.updateMany({
      where: { userId: id, scope: 'PER_SEAT', isActive: true },
      data: { isActive: false },
    });

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.OFFBOARDED, offboardedAt: new Date() },
    });

    this.audit.log({ actorId, action: 'USER_OFFBOARD', targetType: 'User', targetId: id, details: { email: user.email } });
    return updated;
  }

  async assignPerSeatKey(
    userId: string,
    dto: AssignPerSeatKeyDto,
    actorId: string,
  ): Promise<{ vaultPath: string; issuedApiKey?: string }> {
    const user = await this.findById(userId);
    const provider = dto.provider.toLowerCase();
    const vaultPath = `kv/aihub/providers/${provider}/users/${userId}`;

    const existing = await this.prisma.providerKey.findFirst({
      where: { userId, provider: dto.provider, scope: 'PER_SEAT' },
      select: { id: true },
    });

    let providerKeyId: string;
    if (existing) {
      const updated = await this.prisma.providerKey.update({
        where: { id: existing.id },
        data: { vaultPath, isActive: true },
      });
      providerKeyId = updated.id;
    } else {
      const created = await this.prisma.providerKey.create({
        data: {
          userId,
          provider: dto.provider,
          scope: 'PER_SEAT',
          vaultPath,
          isActive: true,
        },
      });
      providerKeyId = created.id;
    }

    try {
      const secretPayload: Record<string, string> = { api_key: dto.apiKey };
      if (dto.gatewayUrl) secretPayload.gateway_url = dto.gatewayUrl;
      await this.vault.writeSecret(vaultPath, secretPayload);
    } catch (err) {
      try {
        await this.prisma.providerKey.update({
          where: { id: providerKeyId },
          data: { isActive: false },
        });
      } catch (rollbackErr: unknown) {
        this.logger.error(`Vault write failed AND rollback failed for providerKey ${providerKeyId}`, rollbackErr);
      }
      throw err;
    }

    let issuedApiKey: string | undefined;
    const currentApiKey = await this.keys.getMyKey(userId);
    if (!currentApiKey) {
      const generated = await this.keys.generateKey(userId, actorId);
      issuedApiKey = generated.plaintext;
    }

    this.audit.log({
      actorId,
      action: 'USER_UPDATE',
      targetType: 'ProviderKey',
      targetId: userId,
      details: {
        operation: 'assign_per_seat_key',
        provider: dto.provider,
        vaultPath,
        issuedInternalApiKey: !currentApiKey,
        email: user.email,
      },
    });

    return { vaultPath, ...(issuedApiKey ? { issuedApiKey } : {}) };
  }

  async bulkImportPerSeatKeys(csvContent: string, actorId: string): Promise<BulkImportPerSeatResult> {
    const lines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return { success: 0, errors: [{ row: 0, reason: 'CSV is empty' }], issuedApiKeys: [] };
    }

    const header = lines[0].replace(/^\uFEFF/, '').toLowerCase().replace(/\s+/g, '');
    if (header !== 'email,provider,api_key') {
      return {
        success: 0,
        errors: [{ row: 1, reason: 'Invalid header. Expected: email,provider,api_key' }],
        issuedApiKeys: [],
      };
    }

    let success = 0;
    const errors: Array<{ row: number; reason: string }> = [];
    const issuedApiKeys: Array<{ email: string; apiKey: string }> = [];
    const parsedRows: Array<{ rowNumber: number; email: string; provider: ProviderType; apiKey: string }> = [];
    const emailSet = new Set<string>();

    for (let i = 1; i < lines.length; i += 1) {
      const rowNumber = i + 1;
      const [emailRaw, providerRaw, apiKeyRaw] = parseCsvLine(lines[i]);
      if (!emailRaw || !providerRaw || !apiKeyRaw) {
        errors.push({ row: rowNumber, reason: 'Missing required fields' });
        continue;
      }

      const email = emailRaw.toLowerCase();
      if (emailSet.has(email)) {
        errors.push({ row: rowNumber, reason: `Duplicate email in CSV: ${email}` });
        continue;
      }
      emailSet.add(email);

      const provider = providerRaw.toUpperCase();
      if (!Object.values(ProviderType).includes(provider as ProviderType)) {
        errors.push({ row: rowNumber, reason: `Unsupported provider: ${providerRaw}` });
        continue;
      }
      parsedRows.push({ rowNumber, email, provider: provider as ProviderType, apiKey: apiKeyRaw });
    }

    if (parsedRows.length === 0) return { success: 0, errors, issuedApiKeys: [] };

    const users = await this.prisma.user.findMany({
      where: { email: { in: parsedRows.map((r) => r.email) } },
      select: { id: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
    for (const row of parsedRows) {
      if (!userMap.has(row.email)) {
        errors.push({ row: row.rowNumber, reason: `User not found: ${row.email}` });
      }
    }

    if (errors.length > 0) return { success: 0, errors, issuedApiKeys: [] };

    for (const row of parsedRows) {
      const userId = userMap.get(row.email)!;
      try {
        const result = await this.assignPerSeatKey(userId, { provider: row.provider, apiKey: row.apiKey }, actorId);
        if (result.issuedApiKey) issuedApiKeys.push({ email: row.email, apiKey: result.issuedApiKey });
        success += 1;
      } catch (err: any) {
        errors.push({
          row: row.rowNumber,
          reason: err?.message ?? 'Failed to assign provider key',
        });
      }
    }

    return { success, errors, issuedApiKeys };
  }

  async bulkImportUsers(csvContent: string, actorId: string): Promise<BulkImportUsersResult> {
    const lines = csvContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return { success: 0, errors: [{ row: 0, reason: 'CSV is empty' }], deliveryQueued: 0 };
    }

    const header = lines[0].replace(/^\uFEFF/, '').toLowerCase().replace(/\s+/g, '');
    if (header !== 'email,full_name,team,tier') {
      return {
        success: 0,
        errors: [{ row: 1, reason: 'Invalid header. Expected: email,full_name,team,tier' }],
        deliveryQueued: 0,
      };
    }

    type ParsedRow = { row: number; email: string; fullName: string; teamName: string; tier: TeamMemberTier };
    const parsedRows: ParsedRow[] = [];
    const errors: Array<{ row: number; reason: string }> = [];
    const seenEmails = new Set<string>();

    for (let i = 1; i < lines.length; i += 1) {
      const rowNumber = i + 1;
      const [emailRaw, fullNameRaw, teamRaw, tierRaw] = parseCsvLine(lines[i]);
      if (!emailRaw || !fullNameRaw || !teamRaw || !tierRaw) {
        errors.push({ row: rowNumber, reason: 'Missing required fields' });
        continue;
      }

      const email = emailRaw.toLowerCase();
      if (seenEmails.has(email)) {
        errors.push({ row: rowNumber, reason: `Duplicate email in CSV: ${email}` });
        continue;
      }
      seenEmails.add(email);

      const tier = tierRaw.toUpperCase();
      if (!Object.values(TeamMemberTier).includes(tier as TeamMemberTier)) {
        errors.push({ row: rowNumber, reason: `Invalid tier: ${tierRaw}` });
        continue;
      }

      parsedRows.push({
        row: rowNumber,
        email,
        fullName: fullNameRaw,
        teamName: teamRaw,
        tier: tier as TeamMemberTier,
      });
    }

    const [teams, existingUsers] = await Promise.all([
      this.prisma.team.findMany({ select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { email: { in: parsedRows.map((r) => r.email) } }, select: { email: true } }),
    ]);
    const teamMap = new Map(teams.map((t) => [t.name.toLowerCase(), t.id]));
    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));

    for (const row of parsedRows) {
      if (existingEmails.has(row.email)) {
        errors.push({ row: row.row, reason: `User already exists: ${row.email}` });
      }
      if (!teamMap.has(row.teamName.toLowerCase())) {
        errors.push({ row: row.row, reason: `Team not found: ${row.teamName}` });
      }
    }

    if (errors.length > 0) return { success: 0, errors, deliveryQueued: 0 };

    let success = 0;
    let deliveryQueued = 0;
    const deliveryErrors: Array<{ row: number; reason: string }> = [];
    for (const row of parsedRows) {
      const teamId = teamMap.get(row.teamName.toLowerCase())!;
      let createdUser: { id: string; email: string } | null = null;
      let keyIssued = false;
      try {
        createdUser = await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: row.email,
              fullName: row.fullName,
              role: UserRole.MEMBER,
              status: UserStatus.ACTIVE,
            },
          });
          await tx.teamMember.create({
            data: {
              userId: user.id,
              teamId,
              tier: row.tier,
              isPrimary: true,
            },
          });
          return { id: user.id, email: user.email };
        });

        this.audit.log({
          actorId,
          action: 'USER_CREATE',
          targetType: 'User',
          targetId: createdUser.id,
          details: { email: createdUser.email, source: 'bulk-import' },
        });

        const { key, plaintext } = await this.keys.generateKey(createdUser.id, actorId);
        keyIssued = true;
        success += 1;

        await this.email.sendOnboardingKeyDelivery({
          userId: createdUser.id,
          email: createdUser.email,
          keyId: key.id,
          keyPlaintext: plaintext,
        });
        deliveryQueued += 1;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (createdUser && !keyIssued) {
          // Avoid leaving ACTIVE user without API key when key generation step fails.
          try {
            await this.prisma.user.delete({ where: { id: createdUser.id } });
          } catch {
            // best-effort cleanup only
          }
        }
        deliveryErrors.push({
          row: row.row,
          reason: `Key generation or email delivery failed: ${message}`,
        });
      }
    }

    return {
      success,
      errors: deliveryErrors,
      deliveryQueued,
    };
  }

  async testProviderKey(
    userId: string,
    dto: AssignPerSeatKeyDto,
    actorId: string,
  ): Promise<TestConnectionResult> {
    await this.findById(userId); // Guard: ensures user exists before calling external APIs
    const result = await this.providerTest.testConnection(dto.provider, dto.apiKey, dto.gatewayUrl);
    this.audit.log({
      actorId,
      action: 'USER_UPDATE',
      targetType: 'ProviderKey',
      targetId: userId,
      details: {
        operation: 'test_connection',
        provider: dto.provider,
        success: result.success,
        latencyMs: result.latencyMs,
      },
    });
    return result;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KeysService } from '../keys/keys.service';
import { User, UserStatus, UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'dev@company.com' })
  @IsEmail() email: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString() fullName: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.MEMBER })
  @IsEnum(UserRole) @IsOptional() role?: UserRole;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsString() @IsOptional() fullName?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole) @IsOptional() role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus) @IsOptional() status?: UserStatus;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
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
        include: { teamMembers: { include: { team: true } } },
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

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.OFFBOARDED, offboardedAt: new Date() },
    });

    this.audit.log({ actorId, action: 'USER_OFFBOARD', targetType: 'User', targetId: id, details: { email: user.email } });
    return updated;
  }
}

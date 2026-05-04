import {
  BadRequestException,
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ApiResponse } from '../../common/dto/response.dto';
import { Auth } from '../../common/decorators/auth.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { KeysService } from './keys.service';
import { UserRole } from '@prisma/client';

interface AuthenticatedRequest {
  user: {
    id: string;
  };
}

interface ClaimKeyDto {
  token: string;
}

interface UpdateKeyGatewayModelDto {
  defaultUpstreamModel: string | null;
}

@ApiTags('keys')
@Controller('v1/keys')
export class KeysController {
  constructor(private readonly keys: KeysService) {}

  @Post()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate API key for a user (plaintext returned once)' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  async generateKey(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const { key, plaintext } = await this.keys.generateKey(userId, req.user.id);
    return ApiResponse.ok({
      id: key.id,
      userId: key.userId,
      keyPrefix: key.keyPrefix,
      status: key.status,
      createdAt: key.createdAt,
      plaintext,
    });
  }

  @Get()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all API keys (admin)' })
  async listKeys(@Query() pagination: PaginationDto) {
    const { keys, total } = await this.keys.listKeys(pagination.page, pagination.limit);
    return ApiResponse.paginated(
      keys.map((k) => ({
        id: k.id,
        userId: k.userId,
        keyPrefix: k.keyPrefix,
        status: k.status,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
        user: {
          fullName: k.user?.fullName ?? 'Unknown user',
          email: k.user?.email ?? 'unknown@aihub.internal',
        },
        providerRouting: k.providerRouting,
        defaultUpstreamModel: k.defaultUpstreamModel ?? null,
      })),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  @Patch(':id/gateway-model')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set LiteLLM model id for this API key (overrides client `model` on gateway). Use for Claude Code + Gemini: clients send claude-*; set e.g. gemini-2.0-flash.',
  })
  @ApiParam({ name: 'id', type: String })
  async updateGatewayModel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateKeyGatewayModelDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!Object.prototype.hasOwnProperty.call(body, 'defaultUpstreamModel')) {
      throw new BadRequestException('Body must include defaultUpstreamModel (string or null to clear)');
    }
    return ApiResponse.ok(
      await this.keys.updateGatewayDefaultModel(id, req.user.id, body.defaultUpstreamModel),
    );
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: "Get current user's own API key info" })
  async getMyKey(@Request() req: AuthenticatedRequest) {
    const key = await this.keys.getMyKey(req.user.id);
    if (!key) return ApiResponse.ok(null);
    return ApiResponse.ok({
      id: key.id,
      keyPrefix: key.keyPrefix,
      status: key.status,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    });
  }

  @Post(':id/rotate')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate API key (old key revoked, new key returned once)' })
  @ApiParam({ name: 'id', type: String })
  async rotateKey(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    const { key, plaintext } = await this.keys.rotateKey(id, req.user.id);
    return ApiResponse.ok({
      id: key.id,
      userId: key.userId,
      keyPrefix: key.keyPrefix,
      status: key.status,
      createdAt: key.createdAt,
      plaintext,
    });
  }

  @Post(':id/revoke')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke API key permanently' })
  @ApiParam({ name: 'id', type: String })
  async revokeKey(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthenticatedRequest) {
    await this.keys.revokeKey(id, req.user.id);
    return ApiResponse.ok({ revoked: true });
  }

  @Post('claim')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim onboarding key once using secure token' })
  async claimKey(@Body() body: ClaimKeyDto, @Request() req: AuthenticatedRequest) {
    return ApiResponse.ok(await this.keys.claimOnboardingKey(req.user.id, body.token));
  }

  @Get(':id/usage')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get usage history for an API key' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  async getKeyUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') fromRaw: string,
    @Query('to') toRaw: string,
  ) {
    if (!fromRaw) throw new BadRequestException('Missing required query param: from');
    if (!toRaw)   throw new BadRequestException('Missing required query param: to');
    const from = new Date(fromRaw);
    const to   = new Date(toRaw);
    if (isNaN(from.getTime())) throw new BadRequestException('Invalid date for from');
    if (isNaN(to.getTime()))   throw new BadRequestException('Invalid date for to');
    return ApiResponse.ok(await this.keys.getKeyUsageHistory(id, from, to));
  }
}

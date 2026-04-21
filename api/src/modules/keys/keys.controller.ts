import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ApiResponse } from '../../common/dto/response.dto';
import { Auth } from '../../common/decorators/auth.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { KeysService } from './keys.service';
import { UserRole } from '@prisma/client';

@ApiTags('keys')
@Controller('v1/keys')
export class KeysController {
  constructor(private readonly keys: KeysService) {}

  @Post()
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate API key for a user (plaintext returned once)' })
  async generateKey(@Query('userId') userId: string, @Request() req: any) {
    const { key, plaintext } = await this.keys.generateKey(userId, req.user.id);
    return ApiResponse.ok({
      id: key.id,
      userId: key.userId,
      keyPrefix: key.keyPrefix,
      status: key.status,
      createdAt: key.createdAt,
      key: plaintext,
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
      })),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: "Get current user's own API key info" })
  async getMyKey(@Request() req: any) {
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
  async rotateKey(@Param('id') id: string, @Request() req: any) {
    const { key, plaintext } = await this.keys.rotateKey(id, req.user.id);
    return ApiResponse.ok({
      id: key.id,
      userId: key.userId,
      keyPrefix: key.keyPrefix,
      status: key.status,
      createdAt: key.createdAt,
      key: plaintext,
    });
  }

  @Post(':id/revoke')
  @Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke API key permanently' })
  @ApiParam({ name: 'id', type: String })
  async revokeKey(@Param('id') id: string, @Request() req: any) {
    await this.keys.revokeKey(id, req.user.id);
    return ApiResponse.ok({ revoked: true });
  }
}

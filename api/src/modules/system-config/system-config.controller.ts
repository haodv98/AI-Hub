import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { SystemConfigService } from './system-config.service';
import { UpdateSmtpDto } from './dto/smtp.dto';
import { UpdateWebhookDto } from './dto/webhook.dto';
import { UpdateAuditConfigDto } from './dto/audit-config.dto';

@ApiTags('config')
@Controller('v1/config')
@Auth(UserRole.IT_ADMIN, UserRole.SUPER_ADMIN)
export class SystemConfigController {
  constructor(private readonly config: SystemConfigService) {}

  @Get('smtp')
  @ApiOperation({ summary: 'Get SMTP configuration' })
  async getSmtp() {
    return ApiResponse.ok(await this.config.getSmtp());
  }

  @Put('smtp')
  @ApiOperation({ summary: 'Update SMTP configuration' })
  async updateSmtp(@Body() dto: UpdateSmtpDto) {
    return ApiResponse.ok(await this.config.updateSmtp(dto));
  }

  @Post('smtp/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test SMTP connection' })
  async testSmtp() {
    return ApiResponse.ok(await this.config.testSmtp());
  }

  @Get('webhooks')
  @ApiOperation({ summary: 'Get webhook configuration' })
  async getWebhooks() {
    return ApiResponse.ok(await this.config.getWebhooks());
  }

  @Put('webhooks')
  @ApiOperation({ summary: 'Update webhook configuration' })
  async updateWebhooks(@Body() dto: UpdateWebhookDto) {
    return ApiResponse.ok(await this.config.updateWebhooks(dto));
  }

  @Get('audit')
  @ApiOperation({ summary: 'Get audit stream configuration' })
  async getAuditConfig() {
    return ApiResponse.ok(await this.config.getAuditConfig());
  }

  @Put('audit')
  @ApiOperation({ summary: 'Update audit stream configuration' })
  async updateAuditConfig(@Body() dto: UpdateAuditConfigDto) {
    return ApiResponse.ok(await this.config.updateAuditConfig(dto));
  }
}

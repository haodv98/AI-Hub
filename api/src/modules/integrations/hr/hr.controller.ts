import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { ApiResponse } from '../../../common/dto/response.dto';
import { HrService } from './hr.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { HrWebhookEventDto } from './hr.dto';

@ApiTags('integrations')
@Controller('v1/webhooks/hr')
export class HrController {
  constructor(
    private readonly hr: HrService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process HR webhook events (onboard/offboard/transfer)' })
  async handleWebhook(
    @Body() event: HrWebhookEventDto,
    @Headers('x-hr-signature') signature?: string,
    @Req() req?: Request & { rawBody?: Buffer },
  ) {
    this.verifySignature(req?.rawBody, signature);
    return ApiResponse.ok(await this.hr.handleEvent(event));
  }

  private verifySignature(rawBody: Buffer | undefined, provided?: string): void {
    const secret = this.config.get<string>('HR_WEBHOOK_SECRET');
    if (!secret) throw new UnauthorizedException('HR webhook secret is not configured');
    if (!provided) throw new UnauthorizedException('Missing webhook signature');
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Missing raw webhook body');
    }

    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const providedHex = provided.startsWith('sha256=') ? provided.slice(7) : provided;

    const expectedBuffer = Buffer.from(expectedHex, 'hex');
    const providedBuffer = Buffer.from(providedHex, 'hex');
    if (expectedBuffer.length !== providedBuffer.length) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}

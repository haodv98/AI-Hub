import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiKeyGuard } from './guards/api-key.guard';
import { GatewayService } from './gateway.service';

@ApiTags('gateway')
@ApiBearerAuth('api-key')
@Controller('v1')
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @Post('chat/completions')
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'OpenAI-compatible chat completions (proxied via LiteLLM)' })
  @ApiBody({ schema: { properties: { model: { type: 'string', example: 'claude-sonnet-4-6' }, messages: { type: 'array' }, stream: { type: 'boolean' } } } })
  async chatCompletions(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    const user = (req as any).user;
    const { data, headers } = await this.gateway.handleRequest(user, body);

    // Set enriched response headers
    Object.entries(headers).forEach(([key, val]) => res.setHeader(key, val));

    return res.json(data);
  }
}

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
  @ApiOperation({ summary: 'OpenAI-compatible chat completions' })
  @ApiBody({ schema: { properties: { model: { type: 'string', example: 'claude-sonnet-4-6' }, messages: { type: 'array' }, stream: { type: 'boolean' } } } })
  async chatCompletions(@Req() req: Request, @Res() res: Response, @Body() body: Record<string, unknown>) {
    const user = (req as Request & { user: unknown }).user;
    const result = await this.gateway.handleRequest(user as Parameters<typeof this.gateway.handleRequest>[0], body);

    Object.entries(result.headers).forEach(([key, val]) => res.setHeader(key, val));

    if (result.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      result.stream.pipe(res);
      return;
    }

    return res.json(result.data);
  }
}

import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Auth } from '../../common/decorators/auth.decorator';
import { ApiResponse } from '../../common/dto/response.dto';
import { UsageService } from './usage.service';
import { Response } from 'express';

function parseDate(raw: string | undefined, name: string): Date {
  if (!raw) throw new BadRequestException(`Missing required query param: ${name}`);
  const d = new Date(raw);
  if (isNaN(d.getTime())) throw new BadRequestException(`Invalid date for ${name}: ${raw}`);
  return d;
}

function buildSimplePdf(content: string): Buffer {
  const escaped = content
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .split('\n')
    .map((line) => `(${line}) Tj`)
    .join('\n0 -14 Td\n');

  const stream = `BT\n/F1 10 Tf\n50 780 Td\n${escaped}\nET`;
  const streamBytes = Buffer.from(stream, 'utf-8');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${streamBytes.length} >> stream\n${stream}\nendstream endobj`,
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += `${obj}\n`;
  }
  const xrefPos = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(body, 'utf-8');
}

@ApiTags('usage')
@Controller('v1/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @Auth(UserRole.IT_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Get usage for a specific user' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'groupBy', required: false, type: String })
  async getUserUsage(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy?: string,
  ) {
    return ApiResponse.ok(
      await this.usage.getUserUsage(userId, parseDate(from, 'from'), parseDate(to, 'to'), groupBy),
    );
  }

  @Get('summary')
  @Auth(UserRole.IT_ADMIN)
  @ApiOperation({ summary: 'Get org-wide usage summary' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  async getOrgSummary(@Query('from') from: string, @Query('to') to: string) {
    return ApiResponse.ok(
      await this.usage.getOrgSummary(parseDate(from, 'from'), parseDate(to, 'to')),
    );
  }

  @Get('teams/:id')
  @Auth(UserRole.IT_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Get usage for a specific team' })
  @ApiParam({ name: 'id', description: 'Team ID' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  async getTeamUsage(
    @Param('id', ParseUUIDPipe) teamId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return ApiResponse.ok(
      await this.usage.getTeamUsage(teamId, parseDate(from, 'from'), parseDate(to, 'to')),
    );
  }

  @Get('heatmap')
  @Auth(UserRole.IT_ADMIN, UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Get usage heatmap (hour x day-of-week)' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  async getHeatmap(@Query('from') from: string, @Query('to') to: string) {
    return ApiResponse.ok(await this.usage.getUsageHeatmap(parseDate(from, 'from'), parseDate(to, 'to')));
  }

  @Get('export')
  @Auth(UserRole.IT_ADMIN)
  @ApiOperation({ summary: 'Export usage summary as CSV or PDF' })
  @ApiQuery({ name: 'format', required: true, enum: ['csv', 'pdf'] })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'ISO date' })
  async exportUsage(
    @Query('format') format: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    if (format !== 'csv' && format !== 'pdf') {
      throw new BadRequestException('format must be csv or pdf');
    }

    const summary = await this.usage.getExportSummary(parseDate(from, 'from'), parseDate(to, 'to'));
    const safeFrom = from.replace(/[:.]/g, '-');
    const safeTo = to.replace(/[:.]/g, '-');
    const filename = `usage-${safeFrom}-${safeTo}.${format}`;

    if (format === 'csv') {
      const lines: string[] = [
        'section,key,value',
        `summary,total_cost_usd,${summary.totalCostUsd}`,
        `summary,total_requests,${summary.totalRequests}`,
      ];
      for (const row of summary.byTeam) {
        lines.push(`team,${row.teamName},${row.costUsd}`);
      }
      for (const row of summary.byProvider) {
        lines.push(`provider,${row.provider},${row.costUsd}`);
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(lines.join('\n'));
    }

    const pdfText = [
      'AIHub Usage Report',
      `Range: ${summary.from} -> ${summary.to}`,
      `Total Cost (USD): ${summary.totalCostUsd}`,
      `Total Requests: ${summary.totalRequests}`,
      '',
      'By Team:',
      ...summary.byTeam.map((row) => `- ${row.teamName}: ${row.costUsd} USD (${row.requestCount} requests)`),
      '',
      'By Provider:',
      ...summary.byProvider.map((row) => `- ${row.provider}: ${row.costUsd} USD (${row.requestCount} requests)`),
    ].join('\n');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buildSimplePdf(pdfText));
  }
}

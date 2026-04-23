import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  async metrics(@Res() res: Response) {
    res.setHeader('Content-Type', this.metricsService.contentType());
    return res.send(await this.metricsService.metrics());
  }
}

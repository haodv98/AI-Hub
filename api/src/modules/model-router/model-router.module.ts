import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ModelRouterService } from './model-router.service';
import { ModelAliasService } from './model-alias.service';
import { ModelAliasController } from './model-alias.controller';

@Module({
  imports: [PrismaModule, MetricsModule],
  controllers: [ModelAliasController],
  providers: [ModelRouterService, ModelAliasService],
  exports: [ModelRouterService],
})
export class ModelRouterModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ModelRouterService } from './model-router.service';
import { ModelAliasService } from './model-alias.service';

@Module({
  imports: [PrismaModule],
  providers: [ModelRouterService, ModelAliasService],
  exports: [ModelRouterService],
})
export class ModelRouterModule {}

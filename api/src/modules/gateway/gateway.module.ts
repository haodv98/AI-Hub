import { Module } from '@nestjs/common';
import { GatewayService } from './gateway.service';
import { GatewayController } from './gateway.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { KeysModule } from '../keys/keys.module';
import { BudgetModule } from '../budget/budget.module';
import { PoliciesModule } from '../policies/policies.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [KeysModule, BudgetModule, PoliciesModule, UsageModule],
  providers: [GatewayService, ApiKeyGuard],
  controllers: [GatewayController],
})
export class GatewayModule {}

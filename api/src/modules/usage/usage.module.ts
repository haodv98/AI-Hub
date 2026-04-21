import { Module } from '@nestjs/common';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { BudgetModule } from '../budget/budget.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [BudgetModule, AlertsModule],
  providers: [UsageService],
  controllers: [UsageController],
  exports: [UsageService],
})
export class UsageModule {}

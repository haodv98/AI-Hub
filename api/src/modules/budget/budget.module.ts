import { Module } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { RateLimitService } from './rate-limit.service';
import { PricingService } from './pricing.service';

@Module({
  providers: [BudgetService, RateLimitService, PricingService],
  exports: [BudgetService, RateLimitService, PricingService],
})
export class BudgetModule {}

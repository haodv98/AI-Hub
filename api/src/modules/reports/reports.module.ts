import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { EmailModule } from '../integrations/email/email.module';

@Module({
  imports: [EmailModule],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

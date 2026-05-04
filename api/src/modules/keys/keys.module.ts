import { Module } from '@nestjs/common';
import { KeysService } from './keys.service';
import { KeysController } from './keys.controller';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../integrations/email/email.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [AuditModule, EmailModule, UsageModule],
  providers: [KeysService],
  controllers: [KeysController],
  exports: [KeysService],
})
export class KeysModule {}

import { Module } from '@nestjs/common';
import { KeysService } from './keys.service';
import { KeysController } from './keys.controller';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../integrations/email/email.module';

@Module({
  imports: [AuditModule, EmailModule],
  providers: [KeysService],
  controllers: [KeysController],
  exports: [KeysService],
})
export class KeysModule {}

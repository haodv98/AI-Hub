import { Module } from '@nestjs/common';
import { KeysService } from './keys.service';
import { KeysController } from './keys.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [KeysService],
  controllers: [KeysController],
  exports: [KeysService],
})
export class KeysModule {}

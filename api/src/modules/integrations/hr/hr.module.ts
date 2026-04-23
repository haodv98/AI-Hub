import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { EmailModule } from '../email/email.module';
import { KeysModule } from '../../keys/keys.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [ConfigModule, EmailModule, KeysModule, AuditModule],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}

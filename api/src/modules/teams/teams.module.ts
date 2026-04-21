import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { AuditModule } from '../audit/audit.module';
import { KeysModule } from '../keys/keys.module';

@Module({
  imports: [AuditModule, KeysModule],
  providers: [TeamsService],
  controllers: [TeamsController],
  exports: [TeamsService],
})
export class TeamsModule {}

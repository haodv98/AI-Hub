import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditModule } from '../audit/audit.module';
import { KeysModule } from '../keys/keys.module';
import { VaultModule } from '../../vault/vault.module';
import { EmailModule } from '../integrations/email/email.module';

@Module({
  imports: [AuditModule, KeysModule, VaultModule, EmailModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}

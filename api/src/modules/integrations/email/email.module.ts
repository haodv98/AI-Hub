import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { OneTimeTokenService } from './one-time-token.service';

@Module({
  providers: [EmailService, OneTimeTokenService],
  exports: [EmailService, OneTimeTokenService],
})
export class EmailModule {}

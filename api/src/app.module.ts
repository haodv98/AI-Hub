import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { VaultModule } from './vault/vault.module';
import { AuditModule } from './modules/audit/audit.module';
import { KeysModule } from './modules/keys/keys.module';
import { UsersModule } from './modules/users/users.module';
import { TeamsModule } from './modules/teams/teams.module';
import { BudgetModule } from './modules/budget/budget.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { UsageModule } from './modules/usage/usage.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HrModule } from './modules/integrations/hr/hr.module';
import { HealthController } from './health.controller';
import { MetricsModule } from './modules/metrics/metrics.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        // Per ADR-0011: NEVER log request/response body
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
        customProps: () => ({ context: 'HTTP' }),
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      },
    }),
    PrismaModule,
    RedisModule,
    VaultModule,
    AuditModule,
    KeysModule,
    UsersModule,
    TeamsModule,
    BudgetModule,
    PoliciesModule,
    AlertsModule,
    UsageModule,
    MetricsModule,
    GatewayModule,
    ReportsModule,
    HrModule,
  ],
})
export class AppModule {}

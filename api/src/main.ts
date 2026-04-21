import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Structured logging via pino
  app.useLogger(app.get(Logger));

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // configured per-route if needed
  }));

  // CORS — restrict to admin portal origin in production
  const config = app.get(ConfigService);
  const isDev = config.get('NODE_ENV') !== 'production';
  app.enableCors({
    origin: isDev ? true : [config.get('PORTAL_ORIGIN', 'https://aihub.internal')],
    credentials: true,
  });

  // Global validation pipe — strip unknown fields
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Global exception filter — consistent error envelope
  app.useGlobalFilters(new GlobalExceptionFilter());

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger — available at /api/docs
  const swaggerCfg = new DocumentBuilder()
    .setTitle('AIHub API')
    .setDescription(
      'Centralized AI Engine resource manager. ' +
      'Use **jwt** for Admin Portal (Keycloak Bearer token) or **api-key** for headless tools (Cursor, CLI).',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'API Key' }, 'api-key')
    .addTag('gateway', 'OpenAI-compatible chat completions proxy')
    .addTag('users', 'User management')
    .addTag('teams', 'Team management')
    .addTag('keys', 'API key lifecycle')
    .addTag('policies', 'Rate-limit / budget policies')
    .addTag('usage', 'Usage and spend reporting')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerCfg), {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`AIHub API running on port ${port}`, 'Bootstrap');
}

bootstrap();

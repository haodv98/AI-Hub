import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const latencyMs = Date.now() - startTime;

          // Per ADR-0011: log metadata only — NEVER body content
          this.logger.log({
            requestId: req.headers['x-request-id'],
            userId: (req as any).user?.id,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            latencyMs,
          });
        },
        error: (err) => {
          const latencyMs = Date.now() - startTime;
          this.logger.error({
            requestId: req.headers['x-request-id'],
            userId: (req as any).user?.id,
            method: req.method,
            path: req.path,
            latencyMs,
            error: err.message,
          });
        },
      }),
    );
  }
}

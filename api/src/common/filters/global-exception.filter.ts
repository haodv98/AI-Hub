import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../constants/error-codes';

const PRISMA_ERROR_MAP: Record<string, { status: number; code: ErrorCode; message: string }> = {
  P2002: { status: 409, code: ErrorCode.CONFLICT, message: 'A record with that value already exists' },
  P2025: { status: 404, code: ErrorCode.NOT_FOUND, message: 'Record not found' },
  P2003: { status: 400, code: ErrorCode.INVALID_REFERENCE, message: 'Invalid reference' },
};

const HTTP_CODE_MAP: Record<number, ErrorCode> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  422: ErrorCode.VALIDATION_ERROR,
  429: ErrorCode.RATE_LIMIT_EXCEEDED,
  500: ErrorCode.INTERNAL_ERROR,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = HTTP_CODE_MAP[status] ?? ErrorCode.INTERNAL_ERROR;
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const bodyObj = body as Record<string, unknown>;
        const rawMsg = bodyObj['message'];
        message = Array.isArray(rawMsg) ? rawMsg.join('; ') : String(rawMsg ?? exception.message);
        if (typeof bodyObj['error'] === 'string') {
          const mapped = Object.values(ErrorCode).find(c => c === bodyObj['error']);
          if (mapped) code = mapped as ErrorCode;
        }
      } else {
        message = String(body);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERROR_MAP[exception.code];
      if (mapped) {
        status = mapped.status;
        code = mapped.code;
        message = mapped.message;
      }
      this.logger.warn(`Prisma error ${exception.code}: ${exception.message}`);
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    const isDev = process.env.NODE_ENV !== 'production';

    res.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(isDev && exception instanceof Error ? { stack: exception.stack } : {}),
      },
      meta: {
        requestId: req.headers['x-request-id'] ?? null,
        path: req.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

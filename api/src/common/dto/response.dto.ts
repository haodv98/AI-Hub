export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ResponseMeta {
  requestId?: string | null;
  timestamp?: string;
  pagination?: PaginationMeta;
}

export class ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: ResponseMeta;

  static ok<T>(data: T, meta?: ResponseMeta): ApiResponse<T> {
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString(), ...meta },
    };
  }

  static paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): ApiResponse<T[]> {
    return {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      },
    };
  }
}

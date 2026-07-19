/** Standardized API response helpers + typed error. */
import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export function ok<T>(res: Response, data: T, pagination?: Pagination): void {
  res.json(pagination ? { success: true, data, pagination } : { success: true, data });
}

export type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/** Wrap an async route so rejections flow to the error middleware. */
export const asyncHandler =
  (fn: AsyncRoute) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export function paginate(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) };
}

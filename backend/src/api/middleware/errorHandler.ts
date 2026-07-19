/** Central error middleware → standardized error envelope. */
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../response.js';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res
      .status(err.status)
      .json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  process.stderr.write(`unhandled API error: ${String(err)}\n`);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}

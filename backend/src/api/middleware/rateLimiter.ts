/** Per-IP rate limiting. */
import rateLimit from 'express-rate-limit';
import { getEnv } from '../../config/env.js';

export const rateLimiter = rateLimit({
  windowMs: 60_000,
  limit: getEnv().RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

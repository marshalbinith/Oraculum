/** CORS restricted to whitelisted origins from env. */
import cors from 'cors';
import { getEnv } from '../../config/env.js';

const allowed = getEnv()
  .CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow same-origin / curl (no origin) and whitelisted browser origins.
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
});

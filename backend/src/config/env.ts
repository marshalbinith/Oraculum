/**
 * Typed environment configuration. All env access in the backend goes through
 * this module — never read `process.env.X` directly elsewhere.
 *
 * Phase 1 scaffold: declares the schema. Consumers are wired up in Phase 8.
 */
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  NETWORK_PASSPHRASE: z.string().min(1),

  FACTORY_ADDRESS: z.string().default(''),
  ORACLE_REGISTRY_ADDRESS: z.string().default(''),
  USDC_TOKEN_ADDRESS: z.string().default(''),

  INDEXER_START_LEDGER: z.coerce.number().int().nonnegative().default(0),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  ORACLE_OPERATOR_SECRET_KEY: z.string().default(''),
  PROTOCOL_TREASURY_ADDRESS: z.string().default(''),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse + validate the process environment once, then memoize. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${parsed.error.toString()}`);
  }
  cached = parsed.data;
  return cached;
}

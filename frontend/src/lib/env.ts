/** Typed public env access. */
export const env = {
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet',
  rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  factory: process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ADDRESS ?? '',
  oracleRegistry: process.env.NEXT_PUBLIC_ORACLE_REGISTRY_ADDRESS ?? '',
  usdc: process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS ?? '',
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001',
} as const;

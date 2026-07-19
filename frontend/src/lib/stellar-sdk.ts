/**
 * Horizon (testnet) helpers built on @stellar/stellar-sdk.
 *
 * All balance/transaction I/O for the /wallet feature lives here. Kept free of
 * any Freighter imports so it can be used from server or client code.
 */
import {
  Asset,
  BASE_FEE,
  Horizon,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

/** Canonical testnet constants (re-exported from stellar-wallet.ts too). */
export const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';

/** Testnet network passphrase (alias for the constant above). */
export const networkPassphrase = STELLAR_TESTNET_PASSPHRASE;

/** Shared Horizon testnet server instance. */
export const server = new Horizon.Server(HORIZON_TESTNET_URL);

function horizon(): Horizon.Server {
  return server;
}

/** True when a Horizon error is a 404 (account not funded yet). */
function isNotFound(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const status = (err as { response?: { status?: number } }).response?.status;
    if (status === 404) return true;
    if ((err as { name?: string }).name === 'NotFoundError') return true;
  }
  return false;
}

/** Pull the most useful message out of a Horizon submit error. */
function extractHorizonError(err: unknown): string {
  if (err && typeof err === 'object') {
    const data = (
      err as {
        response?: {
          data?: {
            extras?: { result_codes?: unknown };
            detail?: string;
            title?: string;
          };
        };
      }
    ).response?.data;
    if (data?.extras?.result_codes) {
      return `Transaction failed — ${JSON.stringify(data.extras.result_codes)}`;
    }
    if (data?.detail) return data.detail;
    if (data?.title) return data.title;
    if ((err as { message?: string }).message) {
      return (err as { message: string }).message;
    }
  }
  return 'Transaction submission failed';
}

/**
 * Fetch the native (XLM) balance for an account from Horizon testnet.
 * Returns "0" when the account is not found (unfunded) rather than throwing.
 */
export async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const account = await horizon().loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === 'native');
    return native ? native.balance : '0';
  } catch (err) {
    if (isNotFound(err)) return '0';
    throw err instanceof Error ? err : new Error('Failed to fetch balance');
  }
}

/**
 * Build an unsigned native-XLM payment transaction and return its XDR.
 * Loads the source account, adds a single payment op, 30s timeout.
 */
export async function buildPaymentXdr(
  from: string,
  to: string,
  amount: string,
): Promise<string> {
  const account = await horizon().loadAccount(from);
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: to,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(30)
    .build();
  return transaction.toXDR();
}

/** Submit a Freighter-signed XDR to Horizon testnet and return the tx hash. */
export async function submitSignedTx(signedXdr: string): Promise<{ hash: string }> {
  const transaction = TransactionBuilder.fromXDR(signedXdr, STELLAR_TESTNET_PASSPHRASE);
  try {
    const res = await horizon().submitTransaction(transaction);
    return { hash: res.hash };
  } catch (err) {
    throw new Error(extractHorizonError(err));
  }
}

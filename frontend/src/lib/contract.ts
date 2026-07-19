/**
 * Generic Soroban contract-call primitives.
 *
 * `callContractFunction` builds → simulates/prepares → signs (via a Freighter
 * signer) → submits → polls a state-changing invocation and returns the tx
 * hash. `readContractFunction` runs a read-only view via simulation.
 *
 * The typed, per-method StellarPredict layer lives in lib/contracts/client.ts
 * and is what the trading/market UI calls; this module is the underlying
 * building block (and the checklist-required `callContractFunction` entry).
 */
import {
  Account,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { env } from '@/lib/env';

/** Shared Soroban RPC server (testnet by default, from NEXT_PUBLIC_SOROBAN_RPC_URL). */
export const sorobanServer = new SorobanRpc.Server(env.rpcUrl, {
  allowHttp: env.rpcUrl.startsWith('http://'),
});

export type Signer = (xdr: string) => Promise<string>;

export interface CallContractArgs {
  /** Source account G-address (also the invocation auth/fee payer). */
  source: string;
  /** Target contract id (C-address). */
  contractId: string;
  /** Contract method name. */
  method: string;
  /** Already-encoded ScVal arguments (see lib/contracts/scval.ts helpers). */
  args?: xdr.ScVal[];
  /** Signs an XDR string and returns the signed XDR (e.g. Freighter). */
  sign: Signer;
}

/**
 * Invoke a state-changing contract function and return the confirmed tx hash.
 * Throws with a descriptive message on submit/confirmation failure.
 */
export async function callContractFunction({
  source,
  contractId,
  method,
  args = [],
  sign,
}: CallContractArgs): Promise<string> {
  const account = await sorobanServer.getAccount(source);
  const contract = new Contract(contractId);
  const built = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await sorobanServer.prepareTransaction(built);
  const signedXdr = await sign(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, env.networkPassphrase);

  const sent = await sorobanServer.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    throw new Error(`Transaction submission failed (${sent.hash})`);
  }

  let result = await sorobanServer.getTransaction(sent.hash);
  for (let i = 0; i < 30 && result.status === 'NOT_FOUND'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await sorobanServer.getTransaction(sent.hash);
  }
  if (result.status !== 'SUCCESS') {
    throw new Error(`Transaction ${sent.hash} failed: ${result.status}`);
  }
  return sent.hash;
}

// A throwaway source used only for read-only simulation (never submitted).
const SIM_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Read a contract view function via simulation and decode the result. */
export async function readContractFunction<T>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(new Account(SIM_SOURCE, '0'), {
    fee: '100',
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await sorobanServer.simulateTransaction(tx);
  if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(`view ${method} failed`);
  }
  return scValToNative(sim.result.retval) as T;
}

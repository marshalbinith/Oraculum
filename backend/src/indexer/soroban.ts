/**
 * Thin wrapper over the Soroban RPC server: event streaming + read-only view
 * calls (via simulation). Decodes ScVal topics/data into native JS values.
 */
import {
  Account,
  Address,
  Contract,
  SorobanRpc,
  TransactionBuilder,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { getEnv } from '../config/env.js';

export interface DecodedEvent {
  contractId: string;
  /** Topic symbols decoded to strings, e.g. ["market", "trade"]. */
  topics: string[];
  /** Event data decoded to native JS (tuple → array). */
  data: unknown;
  ledger: number;
  txHash: string;
  timestamp: number;
}

let server: SorobanRpc.Server | null = null;

export function getServer(): SorobanRpc.Server {
  if (!server) {
    server = new SorobanRpc.Server(getEnv().SOROBAN_RPC_URL, {
      allowHttp: getEnv().SOROBAN_RPC_URL.startsWith('http://'),
    });
  }
  return server;
}

export async function latestLedger(): Promise<number> {
  return (await getServer().getLatestLedger()).sequence;
}

/**
 * Fetch contract events from `startLedger`, optionally filtered to specific
 * contract addresses. Returns decoded events and the next ledger to resume from.
 */
export async function fetchEvents(
  startLedger: number,
  contractIds: string[],
): Promise<{ events: DecodedEvent[]; latestLedger: number }> {
  const filters: SorobanRpc.Api.EventFilter[] = [
    {
      type: 'contract',
      contractIds: contractIds.slice(0, 5), // RPC caps contractIds per filter
    },
  ];
  const res = await getServer().getEvents({ startLedger, filters, limit: 200 });
  const events = res.events.map(decodeEvent);
  return { events, latestLedger: res.latestLedger };
}

function decodeEvent(e: SorobanRpc.Api.EventResponse): DecodedEvent {
  const topics = e.topic.map((t) => {
    try {
      return String(scValToNative(t));
    } catch {
      return '';
    }
  });
  let data: unknown = null;
  try {
    data = scValToNative(e.value);
  } catch {
    data = null;
  }
  return {
    contractId: e.contractId?.toString() ?? '',
    topics,
    data,
    ledger: e.ledger,
    txHash: e.txHash,
    timestamp: Math.floor(new Date(e.ledgerClosedAt).getTime() / 1000),
  };
}

// A throwaway source account for read-only simulation (never submitted).
const SIM_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/**
 * Invoke a read-only contract view via simulation and decode the return value.
 * `args` are pre-built ScVals (most views here take none).
 */
export async function readView<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const contract = new Contract(contractId);
  const account = new Account(SIM_ACCOUNT, '0');
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: getEnv().NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await getServer().simulateTransaction(tx);
  if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(`simulation failed for ${method} on ${contractId}`);
  }
  return scValToNative(sim.result.retval) as T;
}

export function addressToString(a: unknown): string {
  if (a instanceof Address) return a.toString();
  return String(a);
}

/** Build an Address ScVal argument for a view call. */
export function scAddress(addr: string): xdr.ScVal {
  return Address.fromString(addr).toScVal();
}

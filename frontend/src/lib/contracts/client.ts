/**
 * StellarPredict contract client. Builds, simulates, signs (via Freighter), and
 * submits Soroban transactions, and reads view functions via simulation.
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
import { addr, i128, resolutionCondition, str, u64, type Comparison } from './scval';

const server = new SorobanRpc.Server(env.rpcUrl, {
  allowHttp: env.rpcUrl.startsWith('http://'),
});

type Signer = (xdr: string) => Promise<string>;

/** Build → simulate/prepare → sign → submit → poll. Returns the tx hash. */
async function invoke(
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sign: Signer,
): Promise<string> {
  const account = await server.getAccount(source);
  const contract = new Contract(contractId);
  const built = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(built);
  const signedXdr = await sign(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, env.networkPassphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${sent.hash}`);
  }
  // Poll until the transaction is confirmed.
  let result = await server.getTransaction(sent.hash);
  for (let i = 0; i < 30 && result.status === 'NOT_FOUND'; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await server.getTransaction(sent.hash);
  }
  if (result.status !== 'SUCCESS') {
    throw new Error(`Transaction ${sent.hash} failed: ${result.status}`);
  }
  return sent.hash;
}

// A throwaway source for read-only simulation (never submitted).
const SIM_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Read-only view call via simulation. */
async function read<T>(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(new Account(SIM_SOURCE, '0'), {
    fee: '100',
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(`view ${method} failed`);
  }
  return scValToNative(sim.result.retval) as T;
}

export class StellarPredictClient {
  constructor(private sign: Signer) {}

  createMarket(input: {
    creator: string;
    question: string;
    description: string;
    expiry: bigint;
    feedId: string;
    comparison: Comparison;
    threshold: bigint;
    initialUsdc: bigint;
    yesPriceBps: bigint;
  }): Promise<string> {
    return invoke(
      input.creator,
      env.factory,
      'create_market',
      [
        addr(input.creator),
        str(input.question),
        str(input.description),
        u64(input.expiry),
        resolutionCondition({
          feedId: input.feedId,
          comparison: input.comparison,
          threshold: input.threshold,
          resolutionTimestamp: input.expiry,
        }),
        i128(input.initialUsdc),
        i128(input.yesPriceBps),
      ],
      this.sign,
    );
  }

  addLiquidity(market: string, provider: string, usdc: bigint): Promise<string> {
    return invoke(provider, market, 'add_liquidity', [addr(provider), i128(usdc)], this.sign);
  }

  buyYes(market: string, trader: string, usdcIn: bigint, minOut: bigint): Promise<string> {
    return invoke(
      trader,
      market,
      'buy_yes',
      [addr(trader), i128(usdcIn), i128(minOut)],
      this.sign,
    );
  }
  buyNo(market: string, trader: string, usdcIn: bigint, minOut: bigint): Promise<string> {
    return invoke(trader, market, 'buy_no', [addr(trader), i128(usdcIn), i128(minOut)], this.sign);
  }
  sellYes(market: string, trader: string, yesIn: bigint, minOut: bigint): Promise<string> {
    return invoke(
      trader,
      market,
      'sell_yes',
      [addr(trader), i128(yesIn), i128(minOut)],
      this.sign,
    );
  }
  sellNo(market: string, trader: string, noIn: bigint, minOut: bigint): Promise<string> {
    return invoke(trader, market, 'sell_no', [addr(trader), i128(noIn), i128(minOut)], this.sign);
  }
  claimReward(market: string, claimer: string): Promise<string> {
    return invoke(claimer, market, 'claim_reward', [addr(claimer)], this.sign);
  }
  withdrawLiquidity(market: string, provider: string, lp: bigint): Promise<string> {
    return invoke(
      provider,
      market,
      'withdraw_liquidity',
      [addr(provider), i128(lp)],
      this.sign,
    );
  }
}

/** A trader/LP's on-chain position in a market (token balances are 10^7 scaled). */
export interface UserPosition {
  yes_balance: bigint;
  no_balance: bigint;
  lp_balance: bigint;
  claimed: boolean;
}

/** Read the connected user's YES/NO/LP balances for a market. */
export async function getUserPosition(market: string, user: string): Promise<UserPosition> {
  return read<UserPosition>(market, 'get_user_position', [addr(user)]);
}

/** Read a YES-buy quote: returns `[yes_out, price_impact_bps]`. */
export async function quoteBuyYes(market: string, usdcIn: bigint): Promise<[bigint, bigint]> {
  return read<[bigint, bigint]>(market, 'quote_buy_yes', [i128(usdcIn)]);
}
export async function quoteBuyNo(market: string, usdcIn: bigint): Promise<[bigint, bigint]> {
  return read<[bigint, bigint]>(market, 'quote_buy_no', [i128(usdcIn)]);
}

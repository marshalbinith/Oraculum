/** Routes a decoded Soroban event to the appropriate handler by topic. */
import type { DecodedEvent } from './soroban.js';
import { handleMarketCreated } from './handlers/marketCreated.js';
import { handleTrade } from './handlers/trade.js';
import {
  handleLiquidityAdded,
  handleLiquidityWithdrawn,
} from './handlers/liquidityChanged.js';
import { handleMarketLocked, handleMarketResolved } from './handlers/marketResolved.js';
import { handleRewardClaimed } from './handlers/rewardClaimed.js';
import { handleOraclePrice } from './handlers/oraclePrice.js';

export async function processEvent(e: DecodedEvent): Promise<void> {
  const [contract, name] = e.topics;
  const key = `${contract}:${name}`;
  switch (key) {
    case 'factory:created':
      return handleMarketCreated(e);
    case 'market:trade':
      return handleTrade(e);
    case 'market:liq_add':
      return handleLiquidityAdded(e);
    case 'market:liq_out':
      return handleLiquidityWithdrawn(e);
    case 'market:locked':
      return handleMarketLocked(e);
    case 'market:resolved':
      return handleMarketResolved(e);
    case 'market:claim':
      return handleRewardClaimed(e);
    case 'oracle:price':
      return handleOraclePrice(e);
    default:
      return; // market:opened and others need no extra indexing
  }
}

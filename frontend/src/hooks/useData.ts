'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type MarketListParams } from '@/lib/api';

export const useMarkets = (params: MarketListParams) =>
  useQuery({ queryKey: ['markets', params], queryFn: () => api.markets(params) });

export const useMarket = (id: string) =>
  useQuery({ queryKey: ['market', id], queryFn: () => api.market(id), enabled: !!id });

export const useMarketTrades = (id: string) =>
  useQuery({ queryKey: ['trades', id], queryFn: () => api.marketTrades(id), enabled: !!id });

export const usePriceHistory = (id: string) =>
  useQuery({ queryKey: ['price-history', id], queryFn: () => api.priceHistory(id), enabled: !!id });

export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api.stats() });

export const useOracleFeeds = () =>
  useQuery({ queryKey: ['oracle-feeds'], queryFn: () => api.oracleFeeds() });

export const usePortfolio = (address: string | null) =>
  useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => api.portfolio(address as string),
    enabled: !!address,
  });

export const useMarketActivity = (id: string) =>
  useQuery({ queryKey: ['activity', id], queryFn: () => api.marketActivity(id), enabled: !!id });

export const useMarketComments = (id: string) =>
  useQuery({ queryKey: ['comments', id], queryFn: () => api.marketComments(id), enabled: !!id });

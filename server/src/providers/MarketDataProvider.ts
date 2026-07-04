import type { AssetType } from '../types';

export interface QuoteData {
  ticker: string;
  price?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
  raw: Record<string, unknown>;
  source: string;
  asOfDate: Date;
}

export interface FundamentalsData {
  ticker: string;
  type: AssetType;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  source: string;
  asOfDate: Date;
}

export interface DividendData {
  ticker: string;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  source: string;
  asOfDate: Date;
}

export interface FiiIndicators {
  ticker: string;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  source: string;
  asOfDate: Date;
}

export interface MarketDataProvider {
  name: string;
  getQuotes(tickers: string[]): Promise<QuoteData[]>;
  getFundamentals(
    ticker: string,
    type: AssetType,
  ): Promise<FundamentalsData | null>;
  getDividends(ticker: string, type: AssetType): Promise<DividendData[]>;
  getFiiIndicators?(tickers: string[]): Promise<FiiIndicators[]>;
}

import tls from 'node:tls';

import pLimit from 'p-limit';

import type {
  DividendData,
  FundamentalsData,
  FiiIndicators,
  MarketDataProvider,
  QuoteData,
} from './MarketDataProvider';
import type { AssetType } from '../types';
import { maxConcurrentRequests } from '../services/staleDataService';

type ApiRecord = Record<string, unknown>;

const BRAPI_BASE_URL = 'https://brapi.dev/api/v2';
const BRAPI_LEGACY_BASE_URL = 'https://brapi.dev/api';

let certificatesConfigured = false;

const ensureSystemCertificates = () => {
  if (certificatesConfigured) {
    return;
  }

  certificatesConfigured = true;

  try {
    const defaultCertificates = tls.getCACertificates('default');
    const systemCertificates = tls.getCACertificates('system');

    if (systemCertificates.length > 0) {
      tls.setDefaultCACertificates([
        ...defaultCertificates,
        ...systemCertificates,
      ]);
    }
  } catch (error) {
    console.warn('Não foi possível carregar certificados do sistema:', error);
  }
};

const getToken = () => process.env.BRAPI_TOKEN ?? process.env.BRAPI_API_TOKEN;

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value.replace(',', '.'));
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  return undefined;
};

const toStringValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : undefined;

const isRecord = (value: unknown): value is ApiRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly permissionDenied = false,
  ) {
    super(message);
  }
}

export class BrapiProvider implements MarketDataProvider {
  name = 'brapi';

  private batchSize =
    Number.isFinite(Number(process.env.BRAPI_BATCH_SIZE)) &&
    Number(process.env.BRAPI_BATCH_SIZE) > 0
      ? Math.min(Number(process.env.BRAPI_BATCH_SIZE), 10)
      : 10;

  private timeoutMs =
    Number.isFinite(Number(process.env.BRAPI_TIMEOUT_MS)) &&
    Number(process.env.BRAPI_TIMEOUT_MS) > 0
      ? Number(process.env.BRAPI_TIMEOUT_MS)
      : 12000;

  async getQuotes(tickers: string[]): Promise<QuoteData[]> {
    const batches = this.chunk(tickers, this.batchSize);
    const limit = pLimit(maxConcurrentRequests());
    const results = await Promise.all(
      batches.map((batch) => limit(() => this.getQuoteBatch(batch))),
    );

    return results.flat();
  }

  async getFundamentals(
    ticker: string,
    type: AssetType,
  ): Promise<FundamentalsData | null> {
    if (type === 'FII') {
      const indicators = await this.getFiiIndicators?.([ticker]);
      const indicator = indicators?.[0];

      return indicator
        ? {
            ticker,
            type,
            raw: indicator.raw,
            normalized: indicator.normalized,
            source: this.name,
            asOfDate: indicator.asOfDate,
          }
        : null;
    }

    const quote = await this.getLegacyQuote([ticker], false);
    const raw = quote.get(ticker);

    if (!raw) {
      return null;
    }

    return {
      ticker,
      type,
      raw,
      normalized: this.normalizeStockQuote(raw),
      source: this.name,
      asOfDate: new Date(),
    };
  }

  async getDividends(
    ticker: string,
    _type: AssetType,
  ): Promise<DividendData[]> {
    try {
      const quote = await this.getLegacyQuote([ticker], true);
      const raw = quote.get(ticker);
      const dividendsData = isRecord(raw?.dividendsData)
        ? raw.dividendsData
        : {};

      return [
        {
          ticker,
          raw: dividendsData,
          normalized: dividendsData,
          source: this.name,
          asOfDate: new Date(),
        },
      ];
    } catch (error) {
      if (error instanceof ProviderError && error.permissionDenied) {
        return [];
      }

      throw error;
    }
  }

  async getFiiIndicators(tickers: string[]): Promise<FiiIndicators[]> {
    const batches = this.chunk(tickers, this.batchSize);
    const limit = pLimit(maxConcurrentRequests());
    const results = await Promise.all(
      batches.map((batch) => limit(() => this.getFiiIndicatorsBatch(batch))),
    );

    return results.flat();
  }

  private async getQuoteBatch(tickers: string[]) {
    const quoteMap = await this.getLegacyQuote(tickers, false);

    return tickers
      .map((ticker): QuoteData | null => {
        const raw = quoteMap.get(ticker);

        if (!raw) {
          return null;
        }

        return {
          ticker,
          price: toNumber(raw.regularMarketPrice),
          changePercent: toNumber(raw.regularMarketChangePercent),
          volume: toNumber(raw.regularMarketVolume),
          marketCap: toNumber(raw.marketCap),
          raw,
          source: this.name,
          asOfDate: new Date(),
        };
      })
      .filter((quote): quote is QuoteData => quote !== null);
  }

  private async getFiiIndicatorsBatch(tickers: string[]) {
    const payload = await this.fetchJson(`${BRAPI_BASE_URL}/fii/indicators`, {
      symbols: tickers.join(','),
    });
    const fiis = Array.isArray(payload.fiis) ? payload.fiis : [];

    return fiis
      .filter(isRecord)
      .map((item): FiiIndicators | null => {
        const ticker = toStringValue(item.symbol)?.toUpperCase();

        if (!ticker) {
          return null;
        }

        return {
          ticker,
          raw: item,
          normalized: item,
          source: this.name,
          asOfDate: new Date(),
        };
      })
      .filter((item): item is FiiIndicators => item !== null);
  }

  private async getLegacyQuote(
    tickers: string[],
    includeDividends: boolean,
  ) {
    const payload = await this.fetchJson(
      `${BRAPI_LEGACY_BASE_URL}/quote/${tickers.join(',')}`,
      {
        fundamental: 'true',
        ...(includeDividends ? { dividends: 'true' } : {}),
      },
    );
    const map = new Map<string, ApiRecord>();
    const results = Array.isArray(payload.results) ? payload.results : [];

    results.filter(isRecord).forEach((item) => {
      const symbol = toStringValue(item.symbol);

      if (symbol) {
        map.set(symbol.toUpperCase(), item);
      }
    });

    return map;
  }

  private async fetchJson(urlValue: string, params: Record<string, string>) {
    ensureSystemCertificates();

    const url = new URL(urlValue);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const token = getToken();
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });
        const payload = (await response.json()) as ApiRecord;

        if (!response.ok) {
          const message =
            toStringValue(payload.message) ??
            `Erro HTTP ${response.status} ao consultar a Brapi.`;
          const permissionDenied =
            response.status === 401 ||
            response.status === 403 ||
            message.toLowerCase().includes('plano') ||
            message.toLowerCase().includes('permiss');

          throw new ProviderError(message, response.status, permissionDenied);
        }

        return payload;
      } catch (error) {
        if (
          error instanceof ProviderError &&
          (error.permissionDenied || error.statusCode === 401 || error.statusCode === 403)
        ) {
          throw error;
        }

        if (attempt === 2) {
          throw error;
        }

        await sleep(400 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new ProviderError('Falha desconhecida na Brapi.');
  }

  private normalizeStockQuote(raw: ApiRecord) {
    return {
      price: toNumber(raw.regularMarketPrice),
      changePercent: toNumber(raw.regularMarketChangePercent),
      volume: toNumber(raw.regularMarketVolume),
      marketCap: toNumber(raw.marketCap),
      priceEarnings: toNumber(raw.priceEarnings),
      earningsPerShare: toNumber(raw.earningsPerShare),
      fiftyTwoWeekLow: toNumber(raw.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: toNumber(raw.fiftyTwoWeekHigh),
    };
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }

    return chunks;
  }
}

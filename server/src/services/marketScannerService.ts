import tls from 'node:tls';

import { fiiUniverse } from '../data/fiiUniverse';
import { stockUniverse } from '../data/stockUniverse';
import type { MacroIndicators } from '../providers/BancoCentralProvider';
import { CvmProvider } from '../providers/CvmProvider';
import type {
  Asset,
  AssetMetrics,
  AssetStatus,
  AssetType,
  FailedTicker,
  InsufficientDataAsset,
  ScannerResult,
  ScoreBreakdown,
} from '../types';
import {
  clearScannerMemoryCache,
  getScannerMemoryCache,
  setScannerMemoryCache,
} from './scannerCacheService';
import {
  buildScannerFromDatabaseCache,
  findCachedAsset,
  persistScannerRefresh,
} from './marketRefreshService';
import { buildFiiProfile } from './fiiAnalysisService';
import { getMacroIndicators } from './macroDataService';
import { maxConcurrentRequests } from './staleDataService';

type ApiRecord = Record<string, unknown>;

interface RawStockData {
  ticker: string;
  quote?: ApiRecord;
  statistics?: ApiRecord;
  financial?: ApiRecord;
}

interface RawFiiData {
  ticker: string;
  indicators?: ApiRecord;
}

interface BatchResult<T> {
  items: T[];
  failedTickers: FailedTicker[];
}

const BRAPI_BASE_URL = 'https://brapi.dev/api/v2';
const BRAPI_LEGACY_BASE_URL = 'https://brapi.dev/api';
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_TTL_MINUTES = 15;
const configuredBatchSize = Number(process.env.BRAPI_BATCH_SIZE ?? 1);
const BATCH_SIZE =
  Number.isFinite(configuredBatchSize) && configuredBatchSize > 0
    ? Math.min(Math.floor(configuredBatchSize), 20)
    : 1;
const CONCURRENCY_LIMIT = maxConcurrentRequests();
const PUBLIC_TEST_STOCKS = ['PETR4', 'MGLU3', 'VALE3', 'ITUB4'] as const;
const cvmProvider = new CvmProvider();

let inFlightScan: Promise<ScannerResult> | null = null;
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

const isRecord = (value: unknown): value is ApiRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const normalized = Number(value.replace(',', '.'));
    return Number.isFinite(normalized) ? normalized : undefined;
  }

  return undefined;
};

const toStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

const roundScore = (value: number) => Math.round(clamp(value));

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const scoreHigher = (value: number | undefined, weak: number, strong: number) => {
  if (value === undefined) {
    return 0;
  }

  return clamp(((value - weak) / (strong - weak)) * 100);
};

const scoreLower = (value: number | undefined, weak: number, strong: number) => {
  if (value === undefined) {
    return 0;
  }

  return clamp(((weak - value) / (weak - strong)) * 100);
};

const scoreLogHigher = (
  value: number | undefined,
  weak: number,
  strong: number,
) => {
  if (value === undefined || value <= 0) {
    return 0;
  }

  return scoreHigher(Math.log10(value), Math.log10(weak), Math.log10(strong));
};

const scoreSweetSpot = (
  value: number | undefined,
  idealLow: number,
  idealHigh: number,
  weakLow: number,
  weakHigh: number,
) => {
  if (value === undefined) {
    return 0;
  }

  if (value >= idealLow && value <= idealHigh) {
    return 100;
  }

  if (value < idealLow) {
    return scoreHigher(value, weakLow, idealLow);
  }

  return scoreLower(value, weakHigh, idealHigh);
};

const chunk = <T>(items: readonly T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) => {
  const results: R[] = [];
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    },
  );

  await Promise.all(workers);
  return results;
};

const buildHeaders = () => {
  const token = getBrapiToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : undefined;
};

const getBrapiToken = () => process.env.BRAPI_API_TOKEN ?? process.env.BRAPI_TOKEN;

const fetchBrapi = async (path: string, params: Record<string, string>) => {
  ensureSystemCertificates();

  const url = new URL(`${BRAPI_BASE_URL}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: buildHeaders(),
  });
  const payload = (await response.json()) as ApiRecord;

  if (!response.ok) {
    const message =
      toStringValue(payload.message) ??
      (response.status === 429
        ? 'Limite de requisições da Brapi atingido.'
        : `Erro HTTP ${response.status} ao consultar a Brapi.`);

    throw new Error(message);
  }

  return payload;
};

const fetchLegacyQuote = async (
  symbols: readonly string[],
  includeDividends: boolean,
) => {
  ensureSystemCertificates();

  const url = new URL(`${BRAPI_LEGACY_BASE_URL}/quote/${symbols.join(',')}`);
  url.searchParams.set('fundamental', 'true');
  if (includeDividends) {
    url.searchParams.set('dividends', 'true');
  }

  const response = await fetch(url, {
    headers: buildHeaders(),
  });
  const payload = (await response.json()) as ApiRecord;

  if (!response.ok) {
    const message =
      toStringValue(payload.message) ??
      `Erro HTTP ${response.status} ao consultar a Brapi.`;

    throw new Error(message);
  }

  return payload;
};

const mapLegacyQuoteBySymbol = (payload: ApiRecord): Map<string, ApiRecord> => {
  const map = new Map<string, ApiRecord>();
  const results = Array.isArray(payload.results) ? payload.results : [];

  results.forEach((item) => {
    if (!isRecord(item)) {
      return;
    }

    const symbol = toStringValue(item.symbol);

    if (symbol) {
      map.set(symbol.toUpperCase(), item);
    }
  });

  return map;
};

const mapResultsBySymbol = (payload: ApiRecord) => {
  const map = new Map<string, ApiRecord>();
  const results = Array.isArray(payload.results) ? payload.results : [];

  results.forEach((item) => {
    if (!isRecord(item)) {
      return;
    }

    const symbol =
      toStringValue(item.symbol) ?? toStringValue(item.requestedSymbol);
    const data = isRecord(item.data) ? item.data : undefined;

    if (symbol && data) {
      map.set(symbol.toUpperCase(), data);
    }
  });

  return map;
};

const mapFiisBySymbol = (payload: ApiRecord) => {
  const map = new Map<string, ApiRecord>();
  const fiis = Array.isArray(payload.fiis) ? payload.fiis : [];

  fiis.forEach((item) => {
    if (!isRecord(item)) {
      return;
    }

    const symbol = toStringValue(item.symbol);

    if (symbol) {
      map.set(symbol.toUpperCase(), item);
    }
  });

  return map;
};

const failedBatch = (
  symbols: readonly string[],
  type: AssetType,
  reason: string,
): FailedTicker[] =>
  symbols.map((ticker) => ({
    ticker,
    type,
    reason,
  }));

const fetchStockBatch = async (
  symbols: readonly string[],
): Promise<BatchResult<RawStockData>> => {
  try {
    const symbolParam = symbols.join(',');
    const [quotePayload, statisticsPayload, financialPayload] =
      await Promise.all([
        fetchBrapi('/stocks/quote', { symbols: symbolParam }),
        fetchBrapi('/stocks/statistics', {
          symbols: symbolParam,
          mode: 'current',
        }),
        fetchBrapi('/stocks/financial-data', {
          symbols: symbolParam,
          mode: 'current',
        }),
      ]);

    const quoteBySymbol = mapResultsBySymbol(quotePayload);
    const statisticsBySymbol = mapResultsBySymbol(statisticsPayload);
    const financialBySymbol = mapResultsBySymbol(financialPayload);

    return {
      items: symbols.map((ticker) => ({
        ticker,
        quote: quoteBySymbol.get(ticker),
        statistics: statisticsBySymbol.get(ticker),
        financial: financialBySymbol.get(ticker),
      })),
      failedTickers: [],
    };
  } catch (error) {
    try {
      const legacyPayload = await fetchLegacyQuote(symbols, false);
      const legacyQuoteBySymbol = mapLegacyQuoteBySymbol(legacyPayload);

      return {
        items: symbols.map((ticker) => ({
          ticker,
          quote: legacyQuoteBySymbol.get(ticker),
        })),
        failedTickers: [],
      };
    } catch (legacyError) {
      const reason =
        legacyError instanceof Error
          ? legacyError.message
          : error instanceof Error
            ? error.message
            : 'Falha desconhecida na Brapi.';

      return {
        items: [],
        failedTickers: failedBatch(symbols, 'STOCK', reason),
      };
    }
  }
};

const fetchPublicStockBatch = async (
  symbols: readonly string[],
): Promise<BatchResult<RawStockData>> => {
  try {
    const payload = await fetchLegacyQuote(symbols, true);
    const quoteBySymbol = mapLegacyQuoteBySymbol(payload);

    return {
      items: symbols.map((ticker) => ({
        ticker,
        quote: quoteBySymbol.get(ticker),
      })),
      failedTickers: [],
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'Falha desconhecida na Brapi.';

    return {
      items: [],
      failedTickers: failedBatch(symbols, 'STOCK', reason),
    };
  }
};

const fetchFiiFallbackBatch = async (
  symbols: readonly string[],
): Promise<BatchResult<RawFiiData>> => {
  try {
    const cvmDataByTicker = await cvmProvider.getFiiMonthlyData(symbols);
    const quoteResults = await Promise.all(
      symbols.map(async (ticker) => {
        try {
          const payload = await fetchLegacyQuote([ticker], false);
          return [ticker, mapLegacyQuoteBySymbol(payload).get(ticker)] as const;
        } catch {
          return [ticker, undefined] as const;
        }
      }),
    );
    const quoteByTicker = new Map(quoteResults);

    return {
      items: symbols.map((ticker) => {
        const quote = quoteByTicker.get(ticker);
        const cvmData = cvmDataByTicker.get(ticker);
        const price = toNumber(quote?.regularMarketPrice);
        const priceToNav =
          price !== undefined &&
          cvmData?.navPerShare !== undefined &&
          cvmData.navPerShare > 0
            ? price / cvmData.navPerShare
            : undefined;
        const marketDividendYield12m =
          price !== undefined &&
          price > 0 &&
          cvmData?.dividendPerShare12m !== undefined
            ? cvmData.dividendPerShare12m / price
            : cvmData?.dividendYield12m;

        return {
          ticker,
          indicators: {
            symbol: ticker,
            name:
              toStringValue(quote?.longName) ??
              toStringValue(quote?.shortName) ??
              cvmData?.name ??
              ticker,
            price,
            regularMarketVolume: toNumber(quote?.regularMarketVolume),
            priceToNav,
            dividendYield12m: marketDividendYield12m,
            dividendYield12mPatrimonial: cvmData?.dividendYield12m,
            monthlyDividendYield: cvmData?.monthlyDividendYield,
            monthlyDividendPerShare: cvmData?.monthlyDividendPerShare,
            dividendPerShare12m: cvmData?.dividendPerShare12m,
            equity: cvmData?.equity,
            totalAssets: cvmData?.totalAssets,
            totalInvestors: cvmData?.totalInvestors,
            quotasIssued: cvmData?.quotasIssued,
            navPerShare: cvmData?.navPerShare,
            segmentType: cvmData?.segment,
            segmentoAtuacao: cvmData?.segment,
            cnpj: cvmData?.cnpj,
            cvmReferenceDate: cvmData?.referenceDate,
            realEstateAssets: cvmData?.realEstateAssets,
            finishedRentalProperties: cvmData?.finishedRentalProperties,
            constructionRentalProperties:
              cvmData?.constructionRentalProperties,
            criAssets: cvmData?.criAssets,
            fiiAssets: cvmData?.fiiAssets,
            cashAndLiquidity: cvmData?.cashAndLiquidity,
            totalInvested: cvmData?.totalInvested,
            totalLiabilities: cvmData?.totalLiabilities,
            dataSource: 'brapi+cvm',
            dataSourceLabel: 'Brapi pública + CVM informe mensal',
          },
        };
      }),
      failedTickers: [],
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'Falha desconhecida na CVM.';

    return {
      items: [],
      failedTickers: failedBatch(symbols, 'FII', reason),
    };
  }
};

const fetchFiiBatch = async (
  symbols: readonly string[],
): Promise<BatchResult<RawFiiData>> => {
  try {
    const payload = await fetchBrapi('/fii/indicators', {
      symbols: symbols.join(','),
    });
    const fiiBySymbol = mapFiisBySymbol(payload);

    return {
      items: symbols.map((ticker) => ({
        ticker,
        indicators: fiiBySymbol.get(ticker),
      })),
      failedTickers: [],
    };
  } catch (error) {
    const fallback = await fetchFiiFallbackBatch(symbols);

    if (fallback.items.length > 0) {
      return fallback;
    }

    const reason =
      error instanceof Error ? error.message : 'Falha desconhecida na Brapi.';

    return {
      items: [],
      failedTickers:
        fallback.failedTickers.length > 0
          ? fallback.failedTickers
          : failedBatch(symbols, 'FII', reason),
    };
  }
};

const hasNumber = (value: number | undefined) => value !== undefined;

const getStockMissingFields = (
  quote: ApiRecord | undefined,
  statistics: ApiRecord | undefined,
  financial: ApiRecord | undefined,
) => {
  const missing: string[] = [];

  if (!quote) {
    missing.push('cotação');
  }

  if (!statistics) {
    missing.push('estatísticas');
  }

  if (!financial) {
    missing.push('dados financeiros');
  }

  if (quote && !hasNumber(toNumber(quote.regularMarketPrice))) {
    missing.push('preço atual');
  }

  if (quote && !hasNumber(toNumber(quote.regularMarketVolume))) {
    missing.push('volume');
  }

  if (
    statistics &&
    !hasNumber(toNumber(statistics.trailingPE)) &&
    !hasNumber(toNumber(statistics.priceToBook)) &&
    !hasNumber(toNumber(statistics.enterpriseToEbitda))
  ) {
    missing.push('múltiplos de valuation');
  }

  if (financial && !hasNumber(toNumber(financial.returnOnEquity))) {
    missing.push('ROE');
  }

  if (
    financial &&
    !hasNumber(toNumber(financial.profitMargins)) &&
    !hasNumber(toNumber(statistics?.profitMargins))
  ) {
    missing.push('margem líquida');
  }

  return missing;
};

const getFiiMissingFields = (indicators: ApiRecord | undefined) => {
  const missing: string[] = [];

  if (!indicators) {
    return ['indicadores'];
  }

  if (!hasNumber(toNumber(indicators.price))) {
    missing.push('preço atual');
  }

  if (!hasNumber(toNumber(indicators.priceToNav))) {
    missing.push('P/VP');
  }

  if (!hasNumber(toNumber(indicators.dividendYield12m))) {
    missing.push('dividend yield 12m');
  }

  if (!hasNumber(toNumber(indicators.equity))) {
    missing.push('patrimônio líquido');
  }

  if (!hasNumber(toNumber(indicators.totalInvestors))) {
    missing.push('total de investidores');
  }

  return missing;
};

const calculateStockScores = (metrics: RequiredStockMetrics): ScoreBreakdown => {
  const fcfYield =
    metrics.freeCashflow !== undefined &&
    metrics.marketCap !== undefined &&
    metrics.marketCap > 0
      ? metrics.freeCashflow / metrics.marketCap
      : undefined;

  const liquidityScore = scoreLogHigher(metrics.volume, 100_000, 8_000_000);
  const sizeScore = scoreLogHigher(
    metrics.marketCap,
    1_000_000_000,
    150_000_000_000,
  );
  const leverageScore = scoreLower(metrics.debtToEquity, 2.5, 0.2);
  const betaScore = scoreLower(metrics.beta, 1.8, 0.55);

  const quality = roundScore(
    average([
      scoreHigher(metrics.roe, 0.06, 0.24),
      scoreHigher(metrics.profitMargin, 0.04, 0.22),
      scoreHigher(metrics.ebitdaMargin, 0.08, 0.3),
      leverageScore,
      liquidityScore,
      sizeScore,
    ]),
  );

  const price = roundScore(
    average([
      metrics.trailingPe !== undefined && metrics.trailingPe > 0
        ? scoreLower(metrics.trailingPe, 35, 8)
        : 0,
      scoreLower(metrics.priceToBook, 5, 0.8),
      scoreLower(metrics.enterpriseToEbitda, 18, 5),
      scoreHigher(fcfYield, 0.02, 0.12),
    ]),
  );

  const income = roundScore(
    average([
      scoreSweetSpot(metrics.dividendYield ?? 0, 0.025, 0.09, 0, 0.18),
      scoreHigher(metrics.dividendYield ?? 0, 0.01, 0.08),
      liquidityScore,
    ]),
  );

  const growth = roundScore(
    average([
      scoreHigher(metrics.revenueGrowthAnnual, -0.05, 0.16),
      scoreHigher(metrics.earningsGrowthAnnual, -0.08, 0.18),
      scoreHigher(metrics.revenueGrowth, -0.04, 0.12),
      scoreHigher(metrics.earningsGrowth, -0.08, 0.14),
    ]),
  );

  const risk = roundScore(
    average([
      leverageScore,
      betaScore,
      liquidityScore,
      sizeScore,
      metrics.freeCashflow !== undefined && metrics.freeCashflow > 0 ? 80 : 35,
    ]),
  );

  return {
    quality,
    price,
    income,
    growth,
    risk,
    final: roundScore(
      quality * 0.3 +
        price * 0.24 +
        income * 0.12 +
        growth * 0.18 +
        risk * 0.16,
    ),
  };
};

const calculateFiiScores = (metrics: RequiredFiiMetrics): ScoreBreakdown => {
  const investorScore = scoreLogHigher(metrics.totalInvestors, 15_000, 500_000);
  const equityScore = scoreLogHigher(metrics.equity, 200_000_000, 5_000_000_000);
  const leverageProxy =
    metrics.totalAssets !== undefined && metrics.equity > 0
      ? metrics.totalAssets / metrics.equity
      : undefined;
  const leverageScore = scoreLower(leverageProxy, 1.35, 1);
  const pvpRiskScore = scoreSweetSpot(metrics.priceToNav, 0.82, 1.08, 0.55, 1.35);
  const dyRiskScore = scoreSweetSpot(
    metrics.dividendYield12m,
    0.075,
    0.13,
    0.02,
    0.22,
  );

  const quality = roundScore(
    average([
      investorScore,
      equityScore,
      leverageScore,
      pvpRiskScore,
      metrics.segmentType ? 75 : 45,
    ]),
  );

  const price = roundScore(
    average([
      scoreLower(metrics.priceToNav, 1.25, 0.82),
      scoreHigher(metrics.dividendYield12m, 0.06, 0.12),
      pvpRiskScore,
    ]),
  );

  const income = roundScore(
    average([
      scoreSweetSpot(metrics.dividendYield12m, 0.08, 0.13, 0.03, 0.22),
      scoreHigher(metrics.dividendYield12m, 0.06, 0.12),
      investorScore,
    ]),
  );

  const risk = roundScore(
    average([investorScore, equityScore, leverageScore, pvpRiskScore, dyRiskScore]),
  );

  return {
    quality,
    price,
    income,
    risk,
    final: roundScore(quality * 0.3 + price * 0.25 + income * 0.25 + risk * 0.2),
  };
};

interface PublicStockMetrics {
  currentPrice: number;
  volume: number;
  marketCap?: number;
  priceEarnings?: number;
  earningsPerShare?: number;
  dividendYield?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
}

const calculatePublicStockScores = (
  metrics: PublicStockMetrics,
): ScoreBreakdown => {
  const liquidityScore = scoreLogHigher(metrics.volume, 100_000, 8_000_000);
  const sizeScore = scoreLogHigher(metrics.marketCap, 1_000_000_000, 150_000_000_000);
  const peScore =
    metrics.priceEarnings !== undefined && metrics.priceEarnings > 0
      ? scoreLower(metrics.priceEarnings, 35, 7)
      : 0;
  const hasPositiveEps =
    metrics.earningsPerShare !== undefined && metrics.earningsPerShare > 0;
  const rangePosition =
    metrics.fiftyTwoWeekLow !== undefined &&
    metrics.fiftyTwoWeekHigh !== undefined &&
    metrics.fiftyTwoWeekHigh > metrics.fiftyTwoWeekLow
      ? (metrics.currentPrice - metrics.fiftyTwoWeekLow) /
        (metrics.fiftyTwoWeekHigh - metrics.fiftyTwoWeekLow)
      : undefined;
  const rangeScore = scoreLower(rangePosition, 1, 0.15);

  const quality = roundScore(
    average([hasPositiveEps ? 65 : 25, liquidityScore, sizeScore]),
  );
  const price = roundScore(average([peScore, rangeScore]));
  const income = roundScore(
    average([
      scoreSweetSpot(metrics.dividendYield, 0.025, 0.09, 0, 0.18),
      scoreHigher(metrics.dividendYield, 0.01, 0.08),
      liquidityScore,
    ]),
  );
  const risk = roundScore(
    average([
      liquidityScore,
      sizeScore,
      hasPositiveEps ? 65 : 30,
      rangePosition !== undefined ? scoreSweetSpot(rangePosition, 0.1, 0.75, 0, 1) : 45,
    ]),
  );

  return {
    quality,
    price,
    income,
    risk,
    final: roundScore(quality * 0.25 + price * 0.35 + income * 0.15 + risk * 0.25),
  };
};

interface RequiredStockMetrics {
  currentPrice: number;
  volume: number;
  marketCap?: number;
  trailingPe?: number;
  priceToBook?: number;
  enterpriseToEbitda?: number;
  dividendYield?: number;
  roe: number;
  profitMargin: number;
  ebitdaMargin?: number;
  debtToEquity?: number;
  beta?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  revenueGrowthAnnual?: number;
  earningsGrowthAnnual?: number;
  freeCashflow?: number;
}

interface RequiredFiiMetrics {
  price: number;
  priceToNav: number;
  dividendYield12m: number;
  totalInvestors: number;
  equity: number;
  totalAssets?: number;
  segmentType?: string;
}

const getStatusLabel = (scores: ScoreBreakdown): AssetStatus => {
  if (scores.quality >= 76 && scores.price < 45 && scores.risk >= 52) {
    return 'Excelente, mas caro';
  }

  if (scores.price >= 68 && (scores.quality < 52 || scores.risk < 50)) {
    return 'Barato, mas arriscado';
  }

  if (
    scores.final >= 76 &&
    scores.quality >= 62 &&
    scores.price >= 55 &&
    scores.risk >= 55
  ) {
    return 'Oportunidade interessante';
  }

  if (scores.final >= 62 && scores.risk >= 45) {
    return 'Atrativo com cautela';
  }

  return 'Fora dos filtros';
};

const getFocusTags = (assetType: AssetType, scores: ScoreBreakdown) => {
  const tags: string[] = [];

  if (scores.income >= 68 && scores.risk >= 45) {
    tags.push('income');
  }

  if (assetType === 'STOCK' && (scores.growth ?? 0) >= 64 && scores.quality >= 55) {
    tags.push('growth');
  }

  if (
    scores.final >= 64 &&
    scores.quality >= 55 &&
    scores.price >= 45 &&
    scores.risk >= 50
  ) {
    tags.push('balanced');
  }

  return tags;
};

const formatPercent = (value: number | undefined) =>
  value === undefined ? 'n/d' : `${(value * 100).toFixed(1)}%`;

const formatMultiple = (value: number | undefined) =>
  value === undefined ? 'n/d' : `${value.toFixed(1)}x`;

const formatCurrency = (value: number | undefined) =>
  value === undefined
    ? 'n/d'
    : value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const compactNumberRecord = (record: Record<string, number | undefined>) =>
  Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => {
      const value = entry[1];
      return typeof value === 'number' && Number.isFinite(value);
    }),
  );

const getLegacyDividendYield = (quote: ApiRecord) => {
  const directYield = toNumber(quote.dividendYield) ?? toNumber(quote.yield);

  if (directYield !== undefined) {
    return directYield;
  }

  const dividendsData = isRecord(quote.dividendsData)
    ? quote.dividendsData
    : undefined;
  const cashDividends = Array.isArray(dividendsData?.cashDividends)
    ? dividendsData.cashDividends
    : [];
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const dividends = cashDividends.reduce((sum, item) => {
    if (!isRecord(item)) {
      return sum;
    }

    const paymentDate =
      toStringValue(item.paymentDate) ??
      toStringValue(item.date) ??
      toStringValue(item.lastDatePrior);
    const amount =
      toNumber(item.rate) ?? toNumber(item.amount) ?? toNumber(item.value);

    if (amount === undefined) {
      return sum;
    }

    if (!paymentDate) {
      return sum + amount;
    }

    const parsedDate = new Date(paymentDate);

    if (Number.isNaN(parsedDate.getTime()) || parsedDate >= oneYearAgo) {
      return sum + amount;
    }

    return sum;
  }, 0);

  const price = toNumber(quote.regularMarketPrice);

  if (!price || dividends <= 0) {
    return undefined;
  }

  return dividends / price;
};

const createStockNotes = (
  ticker: string,
  scores: ScoreBreakdown,
  metrics: RequiredStockMetrics,
) => {
  const positivePoints = [
    scores.quality >= 65
      ? 'Qualidade operacional acima dos filtros mínimos do radar.'
      : 'Qualidade operacional ainda exige acompanhamento.',
    scores.price >= 60
      ? 'Valuation aparece mais atrativo dentro dos dados disponíveis.'
      : 'Valuation não parece oferecer grande margem de segurança nos dados atuais.',
    (scores.growth ?? 0) >= 60
      ? 'Crescimento de receita ou lucro contribui positivamente para a pontuação.'
      : 'Crescimento recente não é o principal motor da classificação.',
  ];

  const riskPoints = [
    scores.risk >= 60
      ? 'Risco agregado ficou controlado na combinação de beta, liquidez, porte e alavancagem.'
      : 'Risco agregado ficou pressionado por volatilidade, liquidez, porte ou alavancagem.',
    metrics.freeCashflow !== undefined && metrics.freeCashflow > 0
      ? 'Fluxo de caixa livre positivo ajuda a sustentar a análise fundamentalista.'
      : 'Fluxo de caixa livre ausente ou negativo reduz a confiança do modelo.',
    metrics.debtToEquity !== undefined && metrics.debtToEquity > 1.5
      ? 'Alavancagem merece atenção nos próximos resultados.'
      : 'Alavancagem não aparece como o principal ponto de pressão nos dados usados.',
  ];

  const valuationNotes = [
    `P/L: ${formatMultiple(metrics.trailingPe)}. P/VP: ${formatMultiple(metrics.priceToBook)}. EV/EBITDA: ${formatMultiple(metrics.enterpriseToEbitda)}.`,
    `A nota de preço foi ${scores.price}/100 e combina múltiplos, fluxo de caixa livre e preço relativo.`,
  ];

  const dividendNotes = [
    `Dividend yield informado pela Brapi: ${formatPercent(metrics.dividendYield)}.`,
    `A nota de renda foi ${scores.income}/100; ela não é analisada isoladamente no ranking.`,
  ];

  return {
    summary: `${ticker} foi analisado com dados reais disponíveis na Brapi. A classificação "${getStatusLabel(scores)}" combina qualidade, valuation, renda, crescimento e risco.`,
    positivePoints,
    riskPoints,
    valuationNotes,
    dividendNotes,
  };
};

const createFiiNotes = (
  ticker: string,
  scores: ScoreBreakdown,
  metrics: RequiredFiiMetrics,
  sourceLabel = 'Brapi',
) => {
  const positivePoints = [
    scores.income >= 68
      ? 'Renda recorrente aparece competitiva dentro dos filtros do scanner.'
      : 'Renda não é suficiente, sozinha, para sustentar uma pontuação alta.',
    scores.price >= 60
      ? 'P/VP e rendimento indicam valuation razoável nos dados disponíveis.'
      : 'P/VP ou rendimento reduzem o atrativo de valuation.',
    scores.risk >= 55
      ? 'Porte, base de investidores e extremos de P/VP/DY não pressionam demais o risco.'
      : 'Risco exige cautela pela combinação de porte, liquidez, P/VP ou dividend yield elevado.',
  ];

  const riskPoints = [
    metrics.dividendYield12m > 0.16
      ? 'Dividend yield muito alto pode indicar risco ou distribuição menos sustentável.'
      : 'Dividend yield fica em uma faixa menos extrema no modelo.',
    metrics.priceToNav < 0.7
      ? 'P/VP muito descontado pode refletir risco percebido pelo mercado.'
      : 'P/VP não aparece em desconto extremo nos dados usados.',
    metrics.totalInvestors < 30_000
      ? 'Base menor de investidores pode reduzir liquidez e aumentar volatilidade.'
      : 'Base de investidores ajuda a reduzir o risco relativo.',
  ];

  const valuationNotes = [
    `P/VP informado ou calculado com ${sourceLabel}: ${formatMultiple(metrics.priceToNav)}.`,
    `A nota de preço foi ${scores.price}/100 e combina P/VP, renda e penalização de extremos.`,
  ];

  const dividendNotes = [
    `Dividend yield de 12 meses informado ou calculado com ${sourceLabel}: ${formatPercent(metrics.dividendYield12m)}.`,
    `A nota de renda foi ${scores.income}/100 e considera rendimento junto com risco e base de investidores.`,
  ];

  return {
    summary: `${ticker} foi analisado com indicadores reais de ${sourceLabel}. A classificação "${getStatusLabel(scores)}" combina renda, P/VP, qualidade dos dados e risco.`,
    positivePoints,
    riskPoints,
    valuationNotes,
    dividendNotes,
  };
};

const normalizeStock = (
  raw: RawStockData,
  lastUpdated: string,
): Asset | InsufficientDataAsset => {
  const missingFields = getStockMissingFields(
    raw.quote,
    raw.statistics,
    raw.financial,
  );

  if (missingFields.length > 0 || !raw.quote || !raw.statistics || !raw.financial) {
    return {
      ticker: raw.ticker,
      type: 'STOCK',
      reason: 'Dados obrigatórios ausentes na Brapi.',
      missingFields,
      sourceStatus: 'insufficient',
      stale: false,
      dataSource: 'brapi',
    };
  }

  const metrics: RequiredStockMetrics = {
    currentPrice: toNumber(raw.quote.regularMarketPrice) ?? 0,
    volume: toNumber(raw.quote.regularMarketVolume) ?? 0,
    marketCap:
      toNumber(raw.quote.marketCap) ?? toNumber(raw.statistics.marketCap),
    trailingPe: toNumber(raw.statistics.trailingPE),
    priceToBook: toNumber(raw.statistics.priceToBook),
    enterpriseToEbitda: toNumber(raw.statistics.enterpriseToEbitda),
    dividendYield:
      toNumber(raw.statistics.dividendYield) ?? toNumber(raw.statistics.yield),
    roe: toNumber(raw.financial.returnOnEquity) ?? 0,
    profitMargin:
      toNumber(raw.financial.profitMargins) ??
      toNumber(raw.statistics.profitMargins) ??
      0,
    ebitdaMargin: toNumber(raw.financial.ebitdaMargins),
    debtToEquity: toNumber(raw.financial.debtToEquity),
    beta: toNumber(raw.statistics.beta),
    revenueGrowth: toNumber(raw.financial.revenueGrowth),
    earningsGrowth: toNumber(raw.financial.earningsGrowth),
    revenueGrowthAnnual: toNumber(raw.financial.revenueGrowthAnnual),
    earningsGrowthAnnual: toNumber(raw.financial.earningsGrowthAnnual),
    freeCashflow: toNumber(raw.financial.freeCashflow),
  };

  const scores = calculateStockScores(metrics);
  const statusLabel = getStatusLabel(scores);
  const notes = createStockNotes(raw.ticker, scores, metrics);
  const name =
    toStringValue(raw.quote.longName) ??
    toStringValue(raw.quote.shortName) ??
    raw.ticker;
  const sector = toStringValue(raw.statistics.sector) ?? 'Ações brasileiras';

  return {
    rank: 0,
    ticker: raw.ticker,
    name,
    type: 'STOCK',
    sector,
    segment: 'Ação',
    summary: notes.summary,
    statusLabel,
    focusTags: getFocusTags('STOCK', scores),
    scores,
    indicators: compactNumberRecord({
      precoAtual: metrics.currentPrice,
      volume: metrics.volume,
      valorDeMercado: metrics.marketCap,
      pl: metrics.trailingPe,
      pvp: metrics.priceToBook,
      evEbitda: metrics.enterpriseToEbitda,
      dividendYield: metrics.dividendYield,
      roe: metrics.roe,
      margemLiquida: metrics.profitMargin,
      margemEbitda: metrics.ebitdaMargin,
      dividaPatrimonio: metrics.debtToEquity,
      crescimentoReceita: metrics.revenueGrowthAnnual ?? metrics.revenueGrowth,
      crescimentoLucro: metrics.earningsGrowthAnnual ?? metrics.earningsGrowth,
      beta: metrics.beta,
    }),
    metrics: {
      precoAtual: metrics.currentPrice,
      valorDeMercado: metrics.marketCap,
      volume: metrics.volume,
      dividendYield: metrics.dividendYield,
      pvp: metrics.priceToBook,
      pl: metrics.trailingPe,
      evEbitda: metrics.enterpriseToEbitda,
      roe: metrics.roe,
      margemLiquida: metrics.profitMargin,
      crescimentoReceita: metrics.revenueGrowthAnnual ?? metrics.revenueGrowth,
      crescimentoLucro: metrics.earningsGrowthAnnual ?? metrics.earningsGrowth,
      beta: metrics.beta,
      scoreValuation: scores.price,
      scoreRisco: scores.risk,
    },
    positivePoints: notes.positivePoints,
    riskPoints: notes.riskPoints,
    valuationNotes: notes.valuationNotes,
    dividendNotes: notes.dividendNotes,
    dataQuality: 'valid',
    sourceStatus: 'fresh',
    stale: false,
    dataSource: 'brapi',
    lastUpdated,
  };
};

const normalizePublicStock = (
  raw: RawStockData,
  lastUpdated: string,
): Asset | InsufficientDataAsset => {
  if (!raw.quote) {
    return {
      ticker: raw.ticker,
      type: 'STOCK',
      reason: 'Cotação pública não retornada pela Brapi.',
      missingFields: ['cotação'],
      sourceStatus: 'unavailable',
      stale: false,
      dataSource: 'brapi',
    };
  }

  const missingFields: string[] = [];
  const currentPrice = toNumber(raw.quote.regularMarketPrice);
  const volume = toNumber(raw.quote.regularMarketVolume);

  if (currentPrice === undefined) {
    missingFields.push('preço atual');
  }

  if (volume === undefined) {
    missingFields.push('volume');
  }

  if (
    toNumber(raw.quote.priceEarnings) === undefined &&
    toNumber(raw.quote.earningsPerShare) === undefined
  ) {
    missingFields.push('P/L ou LPA');
  }

  if (missingFields.length > 0 || currentPrice === undefined || volume === undefined) {
    return {
      ticker: raw.ticker,
      type: 'STOCK',
      reason: 'Dados públicos insuficientes na Brapi.',
      missingFields,
      sourceStatus: 'insufficient',
      stale: false,
      dataSource: 'brapi',
    };
  }

  const metrics: PublicStockMetrics = {
    currentPrice,
    volume,
    marketCap: toNumber(raw.quote.marketCap),
    priceEarnings: toNumber(raw.quote.priceEarnings),
    earningsPerShare: toNumber(raw.quote.earningsPerShare),
    dividendYield: getLegacyDividendYield(raw.quote),
    fiftyTwoWeekLow: toNumber(raw.quote.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: toNumber(raw.quote.fiftyTwoWeekHigh),
  };
  const scores = calculatePublicStockScores(metrics);
  const statusLabel = getStatusLabel(scores);
  const name =
    toStringValue(raw.quote.longName) ??
    toStringValue(raw.quote.shortName) ??
    raw.ticker;

  return {
    rank: 0,
    ticker: raw.ticker,
    name,
    type: 'STOCK',
    sector: 'Ações brasileiras',
    segment: 'Ação com dados básicos',
    summary: `${raw.ticker} foi analisado com dados de cotação e fundamentos básicos da Brapi. A classificação "${statusLabel}" usa preço, volume, P/L, LPA, dividendos quando disponíveis e faixa de 52 semanas.`,
    statusLabel,
    focusTags: getFocusTags('STOCK', scores),
    scores,
    indicators: compactNumberRecord({
      precoAtual: metrics.currentPrice,
      volume: metrics.volume,
      valorDeMercado: metrics.marketCap,
      pl: metrics.priceEarnings,
      dividendYield: metrics.dividendYield,
      lpa: metrics.earningsPerShare,
      minima52Semanas: metrics.fiftyTwoWeekLow,
      maxima52Semanas: metrics.fiftyTwoWeekHigh,
    }),
    metrics: {
      precoAtual: metrics.currentPrice,
      valorDeMercado: metrics.marketCap,
      volume: metrics.volume,
      dividendYield: metrics.dividendYield,
      pl: metrics.priceEarnings,
      scoreValuation: scores.price,
      scoreRisco: scores.risk,
    },
    positivePoints: [
      'A pontuação usa somente campos realmente retornados pela Brapi.',
      'Preço, volume, P/L, LPA e faixa de 52 semanas ajudam a formar uma leitura básica.',
      scores.price >= 60
        ? 'Valuation relativo ficou atrativo dentro dos campos disponíveis.'
        : 'Valuation relativo não ficou entre os mais fortes da amostra pública.',
    ],
    riskPoints: [
      'Dados básicos têm menos profundidade que os módulos completos de estatísticas e demonstrativos.',
      'Sem ROE, margens e crescimento completos, a análise exige mais cautela.',
      scores.risk >= 55
        ? 'Volume e porte ajudam a reduzir o risco relativo no modelo público.'
        : 'Volume, porte ou lucro por ação reduzem a nota de risco.',
    ],
    valuationNotes: [
      `P/L informado pela Brapi: ${formatMultiple(metrics.priceEarnings)}.`,
      'A nota de valuation também considera a posição do preço dentro da faixa de 52 semanas.',
    ],
    dividendNotes: [
      `Dividend yield calculado/retornado pela Brapi: ${formatPercent(metrics.dividendYield)}.`,
      'Quando dividendos não estão disponíveis no plano, renda recebe menor peso por falta de cobertura.',
    ],
    dataQuality: 'valid',
    sourceStatus: 'fresh',
    stale: false,
    dataSource: 'brapi',
    lastUpdated,
  };
};

const normalizeFii = (
  raw: RawFiiData,
  lastUpdated: string,
  macroIndicators?: MacroIndicators,
): Asset | InsufficientDataAsset => {
  const missingFields = getFiiMissingFields(raw.indicators);

  if (missingFields.length > 0 || !raw.indicators) {
    const sourceLabel = raw.indicators
      ? toStringValue(raw.indicators.dataSourceLabel) ?? 'fontes disponíveis'
      : 'fontes disponíveis';

    return {
      ticker: raw.ticker,
      type: 'FII',
      reason: `Indicadores obrigatórios ausentes em ${sourceLabel}.`,
      missingFields,
      sourceStatus: 'insufficient',
      stale: false,
      dataSource: toStringValue(raw.indicators?.dataSource) ?? 'brapi',
    };
  }

  const metrics: RequiredFiiMetrics = {
    price: toNumber(raw.indicators.price) ?? 0,
    priceToNav: toNumber(raw.indicators.priceToNav) ?? 0,
    dividendYield12m: toNumber(raw.indicators.dividendYield12m) ?? 0,
    totalInvestors: toNumber(raw.indicators.totalInvestors) ?? 0,
    equity: toNumber(raw.indicators.equity) ?? 0,
    totalAssets: toNumber(raw.indicators.totalAssets),
    segmentType: toStringValue(raw.indicators.segmentType),
  };

  const scores = calculateFiiScores(metrics);
  const statusLabel = getStatusLabel(scores);
  const sourceLabel =
    toStringValue(raw.indicators.dataSourceLabel) ?? 'Brapi';
  const dataSource = toStringValue(raw.indicators.dataSource) ?? 'brapi';
  const notes = createFiiNotes(raw.ticker, scores, metrics, sourceLabel);
  const dividendPerShare12m = toNumber(raw.indicators.dividendPerShare12m);
  const marketDividendYieldNote =
    dividendPerShare12m !== undefined
      ? `DY 12m calculado como rendimento acumulado por cota (${formatCurrency(dividendPerShare12m)}) dividido pela cotação atual.`
      : undefined;
  const fiiProfile = buildFiiProfile(
    raw.ticker,
    raw.indicators,
    metrics,
    scores,
    macroIndicators,
  );
  const name = toStringValue(raw.indicators.name) ?? raw.ticker;
  const segment =
    toStringValue(raw.indicators.segmentoAtuacao) ??
    toStringValue(raw.indicators.segmentType) ??
    'FII';

  return {
    rank: 0,
    ticker: raw.ticker,
    name,
    type: 'FII',
    sector: 'Fundos imobiliários',
    segment,
    summary: notes.summary,
    statusLabel,
    focusTags: getFocusTags('FII', scores),
    scores,
    indicators: compactNumberRecord({
      precoAtual: metrics.price,
      pvp: metrics.priceToNav,
      dividendYield: metrics.dividendYield12m,
      dividendYieldPatrimonial12m: toNumber(
        raw.indicators.dividendYield12mPatrimonial,
      ),
      dividendYieldMensal: toNumber(raw.indicators.monthlyDividendYield),
      rendimentoMensalPorCota: toNumber(raw.indicators.monthlyDividendPerShare),
      rendimento12mPorCota: toNumber(raw.indicators.dividendPerShare12m),
      valorPatrimonialCota: toNumber(raw.indicators.navPerShare),
      patrimonioLiquido: metrics.equity,
      totalAtivos: metrics.totalAssets,
      totalInvestidores: metrics.totalInvestors,
      cotasEmitidas: toNumber(raw.indicators.quotasIssued),
      imoveis: toNumber(raw.indicators.realEstateAssets),
      imoveisRendaAcabados: toNumber(raw.indicators.finishedRentalProperties),
      imoveisRendaConstrucao: toNumber(
        raw.indicators.constructionRentalProperties,
      ),
      criCra: toNumber(raw.indicators.criAssets),
      cotasFii: toNumber(raw.indicators.fiiAssets),
      liquidezCaixa: toNumber(raw.indicators.cashAndLiquidity),
      totalInvestido: toNumber(raw.indicators.totalInvested),
      totalPassivo: toNumber(raw.indicators.totalLiabilities),
    }),
    metrics: {
      precoAtual: metrics.price,
      dividendYield: metrics.dividendYield12m,
      pvp: metrics.priceToNav,
      patrimonioLiquido: metrics.equity,
      totalInvestidores: metrics.totalInvestors,
      scoreValuation: scores.price,
      scoreRisco: scores.risk,
    },
    fiiProfile: fiiProfile.profile,
    positivePoints: [...notes.positivePoints, ...fiiProfile.positivePoints],
    riskPoints: [...notes.riskPoints, ...fiiProfile.riskPoints],
    valuationNotes: [...notes.valuationNotes, ...fiiProfile.valuationNotes],
    dividendNotes: [
      ...notes.dividendNotes,
      ...(marketDividendYieldNote ? [marketDividendYieldNote] : []),
      ...fiiProfile.dividendNotes,
    ],
    dataQuality: 'valid',
    sourceStatus: 'fresh',
    stale: false,
    dataSource,
    lastUpdated,
  };
};

const rankAssets = (assets: Asset[]) =>
  [...assets]
    .sort((a, b) => b.scores.final - a.scores.final)
    .map((asset, index) => ({
      ...asset,
      rank: index + 1,
    }));

const byIncomeOpportunity = (assets: Asset[]) =>
  [...assets].sort(
    (a, b) =>
      b.scores.income * 0.45 +
      b.scores.final * 0.35 +
      b.scores.risk * 0.2 -
      (a.scores.income * 0.45 + a.scores.final * 0.35 + a.scores.risk * 0.2),
  );

const byGrowthOpportunity = (assets: Asset[]) =>
  [...assets].sort(
    (a, b) =>
      ((b.scores.growth ?? 0) * 0.45 +
        b.scores.quality * 0.25 +
        b.scores.price * 0.15 +
        b.scores.risk * 0.15) -
      ((a.scores.growth ?? 0) * 0.45 +
        a.scores.quality * 0.25 +
        a.scores.price * 0.15 +
        a.scores.risk * 0.15),
  );

const buildScannerResult = (
  assets: Asset[],
  insufficientData: InsufficientDataAsset[],
  failedTickers: FailedTicker[],
  lastUpdated: string,
  dataMode: ScannerResult['dataMode'],
  warnings: string[],
): ScannerResult => {
  const rankedAssets = rankAssets(assets);
  const cacheExpiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();

  return {
    lastUpdated,
    cacheExpiresAt,
    cacheTtlMinutes: CACHE_TTL_MINUTES,
    dataMode,
    warnings,
    totalAssets: stockUniverse.length + fiiUniverse.length,
    successfulFreshFetches: rankedAssets.filter(
      (asset) => asset.sourceStatus === 'fresh',
    ).length,
    usedCachedData: rankedAssets.filter(
      (asset) => asset.sourceStatus === 'cached' || asset.sourceStatus === 'stale',
    ).length,
    staleAssets: rankedAssets.filter((asset) => asset.stale).length,
    universe: {
      stocks: stockUniverse.length,
      fiis: fiiUniverse.length,
      total: stockUniverse.length + fiiUniverse.length,
    },
    analyzedCount: rankedAssets.length,
    insufficientCount: insufficientData.length,
    failedTickers,
    assets: rankedAssets,
    bestOverall: rankedAssets,
    bestStocks: rankedAssets.filter((asset) => asset.type === 'STOCK'),
    bestFiis: rankedAssets.filter((asset) => asset.type === 'FII'),
    bestIncome: byIncomeOpportunity(
      rankedAssets.filter(
        (asset) => asset.focusTags.includes('income') && asset.scores.risk >= 45,
      ),
    ),
    bestGrowth: byGrowthOpportunity(
      rankedAssets.filter(
        (asset) => asset.type === 'STOCK' && asset.focusTags.includes('growth'),
      ),
    ),
    excellentButExpensive: rankedAssets.filter(
      (asset) => asset.statusLabel === 'Excelente, mas caro',
    ),
    cheapButRisky: rankedAssets.filter(
      (asset) => asset.statusLabel === 'Barato, mas arriscado',
    ),
    insufficientData,
  };
};

const executeBroadScan = async (): Promise<ScannerResult> => {
  const lastUpdated = new Date().toISOString();
  const stockBatches = chunk(stockUniverse, BATCH_SIZE);
  const fiiBatches = chunk(fiiUniverse, BATCH_SIZE);
  const macroIndicators = await getMacroIndicators();

  const stockResults = await runWithConcurrency(
    stockBatches,
    CONCURRENCY_LIMIT,
    fetchStockBatch,
  );
  const fiiResults = await runWithConcurrency(
    fiiBatches,
    CONCURRENCY_LIMIT,
    fetchFiiBatch,
  );

  const failedTickers = [
    ...stockResults.flatMap((result) => result.failedTickers),
    ...fiiResults.flatMap((result) => result.failedTickers),
  ];

  const stockItems = stockResults.flatMap((result) => result.items);
  const fiiItems = fiiResults.flatMap((result) => result.items);

  const normalized = [
    ...stockItems.map((item) =>
      item.statistics || item.financial
        ? normalizeStock(item, lastUpdated)
        : normalizePublicStock(item, lastUpdated),
    ),
    ...fiiItems.map((item) => normalizeFii(item, lastUpdated, macroIndicators)),
  ];

  const assets = normalized.filter((item): item is Asset => 'scores' in item);
  const insufficientData = normalized.filter(
    (item): item is InsufficientDataAsset => !('scores' in item),
  );

  return buildScannerResult(
    assets,
    insufficientData,
    failedTickers,
    lastUpdated,
    'brapi-amplo',
    [],
  );
};

const executeLimitedPublicScan = async (
  inheritedFailures: FailedTicker[] = [],
): Promise<ScannerResult> => {
  const lastUpdated = new Date().toISOString();
  const stockSet = new Set<string>(stockUniverse);
  const publicSet = new Set<string>(PUBLIC_TEST_STOCKS);
  const publicSymbols = PUBLIC_TEST_STOCKS.filter((ticker) => stockSet.has(ticker));
  const publicResult = await fetchPublicStockBatch(publicSymbols);
  const normalized = publicResult.items.map((item) =>
    normalizePublicStock(item, lastUpdated),
  );
  const assets = normalized.filter((item): item is Asset => 'scores' in item);
  const insufficientData = normalized.filter(
    (item): item is InsufficientDataAsset => !('scores' in item),
  );
  const unavailableStocks = stockUniverse
    .filter((ticker) => !publicSet.has(ticker))
    .map((ticker) => ({
      ticker,
      type: 'STOCK' as const,
      reason:
        'BRAPI_API_TOKEN não configurado. A Brapi libera sem token apenas ações de teste.',
    }));
  const unavailableFiis = fiiUniverse.map((ticker) => ({
    ticker,
    type: 'FII' as const,
    reason:
      'BRAPI_API_TOKEN não configurado. Indicadores de FIIs exigem autenticação na Brapi.',
  }));

  return buildScannerResult(
    assets,
    insufficientData,
    [
      ...publicResult.failedTickers,
      ...inheritedFailures,
      ...unavailableStocks,
      ...unavailableFiis,
    ],
    lastUpdated,
    'brapi-limitado-sem-token',
    [
      'Modo limitado sem token da Brapi: apenas PETR4, MGLU3, VALE3 e ITUB4 têm acesso público irrestrito.',
      'Configure BRAPI_API_TOKEN para escanear o universo amplo de ações e FIIs.',
    ],
  );
};

const executeScan = async (): Promise<ScannerResult> => {
  if (!getBrapiToken()) {
    return executeLimitedPublicScan();
  }

  const broadScan = await executeBroadScan();

  if (broadScan.assets.length === 0) {
    return executeLimitedPublicScan(broadScan.failedTickers);
  }

  return broadScan;
};

const isColdDatabaseScan = (scan: ScannerResult) =>
  scan.analyzedCount === 0 &&
  scan.failedTickers.length === 0 &&
  scan.lastUpdated === new Date(0).toISOString();

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro desconhecido.';

const withWarnings = (scan: ScannerResult, warnings: string[]) => ({
  ...scan,
  warnings: [...scan.warnings, ...warnings],
});

export const getMarketScan = async (
  forceRefresh = false,
): Promise<ScannerResult> => {
  if (!forceRefresh) {
    const memoryCachedResult = getScannerMemoryCache();

    if (memoryCachedResult) {
      return memoryCachedResult;
    }

    try {
      const databaseCachedResult = await buildScannerFromDatabaseCache();
      if (isColdDatabaseScan(databaseCachedResult)) {
        return getMarketScan(true);
      }

      setScannerMemoryCache(databaseCachedResult);
      return databaseCachedResult;
    } catch (error) {
      console.error('Falha ao carregar cache persistente do scanner:', error);
      const refreshedResult = await getMarketScan(true);
      return withWarnings(refreshedResult, [
        `Cache persistente indisponível: ${getErrorMessage(error)}`,
      ]);
    }
  }

  if (inFlightScan) {
    return inFlightScan;
  }

  inFlightScan = executeScan()
    .then(async (result) => {
      try {
        await persistScannerRefresh(result);

        const refreshedResult = await buildScannerFromDatabaseCache(
          new Set(result.assets.map((asset) => asset.ticker)),
          result.failedTickers,
          result.warnings,
        );

        clearScannerMemoryCache();
        setScannerMemoryCache(refreshedResult);
        return refreshedResult;
      } catch (error) {
        console.error('Falha ao persistir scanner no banco:', error);
        const scanWithWarning = withWarnings(result, [
          `Resultado gerado sem cache persistente: ${getErrorMessage(error)}`,
        ]);

        clearScannerMemoryCache();
        setScannerMemoryCache(scanWithWarning);
        return scanWithWarning;
      }
    })
    .finally(() => {
      inFlightScan = null;
    });

  return inFlightScan;
};

export const findScoredAsset = async (ticker: string) => {
  return findCachedAsset(ticker);
};

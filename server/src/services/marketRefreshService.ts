import type { Asset as PrismaAssetType } from '@prisma/client';

import { fiiUniverse } from '../data/fiiUniverse';
import { stockUniverse } from '../data/stockUniverse';
import { getPrisma } from '../db/prisma';
import type {
  Asset,
  FailedTicker,
  InsufficientDataAsset,
  ScannerResult,
  SourceStatus,
} from '../types';
import { isQuoteFresh, scannerCacheMinutes } from './staleDataService';

const allUniverseTickers = [
  ...stockUniverse.map((ticker) => ({ ticker, type: 'STOCK' as const })),
  ...fiiUniverse.map((ticker) => ({ ticker, type: 'FII' as const })),
];

const isPermissionFailure = (reason: string) => {
  const normalized = reason.toLowerCase();
  return (
    normalized.includes('plano') ||
    normalized.includes('permiss') ||
    normalized.includes('permission') ||
    normalized.includes('401') ||
    normalized.includes('403')
  );
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

const parseAsset = (value: string) => JSON.parse(value) as Asset;

interface CachedFailure {
  endpoint: string;
  reason: string;
}

const getLatestByTicker = <T extends { ticker: string }>(items: T[]) => {
  const map = new Map<string, T>();

  items.forEach((item) => {
    if (!map.has(item.ticker)) {
      map.set(item.ticker, item);
    }
  });

  return map;
};

const buildScannerResult = (
  assets: Asset[],
  insufficientData: InsufficientDataAsset[],
  failedTickers: FailedTicker[],
  lastUpdated: string,
  successfulFreshFetches: number,
  warnings: string[],
): ScannerResult => {
  const rankedAssets = rankAssets(assets);
  const cacheExpiresAt = new Date(
    Date.now() + scannerCacheMinutes() * 60 * 1000,
  ).toISOString();

  return {
    lastUpdated,
    cacheExpiresAt,
    cacheTtlMinutes: scannerCacheMinutes(),
    dataMode: 'brapi-amplo',
    warnings,
    totalAssets: allUniverseTickers.length,
    successfulFreshFetches,
    usedCachedData: rankedAssets.filter(
      (asset) => asset.sourceStatus === 'cached' || asset.sourceStatus === 'stale',
    ).length,
    staleAssets: rankedAssets.filter((asset) => asset.stale).length,
    universe: {
      stocks: stockUniverse.length,
      fiis: fiiUniverse.length,
      total: allUniverseTickers.length,
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

export const persistScannerRefresh = async (scan: ScannerResult) => {
  const prisma = getPrisma();
  const asOfDate = new Date(scan.lastUpdated);

  for (const asset of scan.assets) {
    await prisma.asset.upsert({
      where: { ticker: asset.ticker },
      update: {
        name: asset.name,
        type: asset.type,
        sector: asset.sector,
        segment: asset.segment,
      },
      create: {
        ticker: asset.ticker,
        name: asset.name,
        type: asset.type,
        sector: asset.sector,
        segment: asset.segment,
      },
    });

    await prisma.quoteSnapshot.create({
      data: {
        ticker: asset.ticker,
        price: asset.metrics.precoAtual,
        changePercent: undefined,
        volume: asset.metrics.volume,
        marketCap: asset.metrics.valorDeMercado,
        source: asset.dataSource,
        asOfDate,
      },
    });

    await prisma.fundamentalsSnapshot.create({
      data: {
        ticker: asset.ticker,
        assetType: asset.type,
        rawJson: JSON.stringify({
          indicators: asset.indicators,
          metrics: asset.metrics,
        }),
        normalizedJson: JSON.stringify(asset),
        source: asset.dataSource,
        asOfDate,
      },
    });

    await prisma.dividendSnapshot.create({
      data: {
        ticker: asset.ticker,
        rawJson: JSON.stringify({
          dividendNotes: asset.dividendNotes,
        }),
        normalizedJson: JSON.stringify({
          dividendYield: asset.metrics.dividendYield,
        }),
        source: asset.dataSource,
        asOfDate,
      },
    });

    await prisma.scoreSnapshot.create({
      data: {
        ticker: asset.ticker,
        finalScore: asset.scores.final,
        qualityScore: asset.scores.quality,
        valuationScore: asset.scores.price,
        incomeScore: asset.scores.income,
        growthScore: asset.scores.growth,
        riskScore: asset.scores.risk,
        status: asset.statusLabel,
        missingFields: JSON.stringify([]),
        stale: false,
        source: asset.dataSource,
        asOfDate,
      },
    });
  }

  for (const failure of scan.failedTickers) {
    await prisma.apiFailureLog.create({
      data: {
        ticker: failure.ticker,
        provider: 'brapi',
        endpoint: 'scanner-refresh',
        statusCode: isPermissionFailure(failure.reason) ? 403 : undefined,
        errorMessage: failure.reason,
      },
    });
  }

  for (const item of scan.insufficientData) {
    if (isPermissionFailure(item.reason)) {
      continue;
    }

    await prisma.apiFailureLog.create({
      data: {
        ticker: item.ticker,
        provider: 'brapi',
        endpoint: 'scanner-validation',
        errorMessage:
          item.missingFields.length > 0
            ? `${item.reason} Campos ausentes: ${item.missingFields.join(', ')}.`
            : item.reason,
      },
    });
  }
};

export const buildScannerFromDatabaseCache = async (
  freshTickers = new Set<string>(),
  failedTickers: FailedTicker[] = [],
  warnings: string[] = [],
) => {
  const prisma = getPrisma();
  const [scores, fundamentals, failureLogs] = await Promise.all([
    prisma.scoreSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.fundamentalsSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
    }),
    prisma.apiFailureLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  const latestScores = getLatestByTicker(scores);
  const latestFundamentals = getLatestByTicker(fundamentals);
  const recentFailureMap = new Map<string, CachedFailure>();

  failureLogs.forEach((failure) => {
    if (!recentFailureMap.has(failure.ticker)) {
      recentFailureMap.set(failure.ticker, {
        endpoint: failure.endpoint,
        reason: failure.errorMessage,
      });
    }
  });

  failedTickers.forEach((failure) => {
    recentFailureMap.set(failure.ticker, {
      endpoint: 'scanner-refresh',
      reason: failure.reason,
    });
  });

  const assets: Asset[] = [];
  const insufficientData: InsufficientDataAsset[] = [];
  let lastUpdatedDate: Date | null = null;

  for (const universeItem of allUniverseTickers) {
    const score = latestScores.get(universeItem.ticker);
    const fundamentalsSnapshot = latestFundamentals.get(universeItem.ticker);

    if (score && fundamentalsSnapshot) {
      const asset = parseAsset(fundamentalsSnapshot.normalizedJson);
      const fresh = freshTickers.has(asset.ticker);
      const stale = !fresh && !isQuoteFresh(score.asOfDate);
      const sourceStatus: SourceStatus = fresh ? 'fresh' : stale ? 'stale' : 'cached';

      assets.push({
        ...asset,
        scores: {
          quality: score.qualityScore,
          price: score.valuationScore,
          income: score.incomeScore,
          growth: score.growthScore ?? undefined,
          risk: score.riskScore,
          final: score.finalScore,
        },
        statusLabel: score.status as Asset['statusLabel'],
        sourceStatus,
        stale,
        scoreSnapshotId: score.id,
        lastUpdated: score.asOfDate.toISOString(),
      });

      if (!lastUpdatedDate || score.asOfDate > lastUpdatedDate) {
        lastUpdatedDate = score.asOfDate;
      }

      continue;
    }

    const reason =
      recentFailureMap.get(universeItem.ticker)?.reason ??
      'Dados ainda não carregados no cache local.';

    insufficientData.push({
      ticker: universeItem.ticker,
      type: universeItem.type,
      reason,
      missingFields: [],
      sourceStatus: isPermissionFailure(reason) ? 'permission-denied' : 'unavailable',
      stale: false,
      dataSource: 'brapi',
    });
  }

  const lastUpdated =
    lastUpdatedDate?.toISOString() ?? new Date(0).toISOString();
  const distinctFailures = [...recentFailureMap.entries()]
    .filter(([, failure]) => failure.endpoint !== 'scanner-validation')
    .map(([ticker, failure]) => ({
      ticker,
      type:
        stockUniverse.includes(ticker as (typeof stockUniverse)[number])
          ? ('STOCK' as const)
          : ('FII' as const),
      reason: failure.reason,
    }));

  return buildScannerResult(
    assets,
    insufficientData,
    distinctFailures,
    lastUpdated,
    freshTickers.size,
    warnings,
  );
};

export const findCachedAsset = async (ticker: string) => {
  const scan = await buildScannerFromDatabaseCache();
  return scan.assets.find((asset) => asset.ticker === ticker.toUpperCase());
};

export const ensureAssetExistsForAnalysis = async (asset: Asset) => {
  const prisma = getPrisma();

  await prisma.asset.upsert({
    where: { ticker: asset.ticker },
    update: {
      name: asset.name,
      type: asset.type,
      sector: asset.sector,
      segment: asset.segment,
    },
    create: {
      ticker: asset.ticker,
      name: asset.name,
      type: asset.type,
      sector: asset.sector,
      segment: asset.segment,
    },
  });
};

export const getAssetRecord = async (ticker: string): Promise<PrismaAssetType | null> =>
  getPrisma().asset.findUnique({
    where: { ticker },
  });

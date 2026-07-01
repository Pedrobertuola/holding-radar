import type {
  AssetInput,
  AssetStatus,
  AssetType,
  FiiAssetInput,
  ScoreBreakdown,
  StockAssetInput,
} from '../types';

type ScoreComponents = Omit<ScoreBreakdown, 'final'>;

const clamp = (value: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));

const roundScore = (value: number) => Math.round(clamp(value));

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const scoreHigher = (value: number, weak: number, strong: number) =>
  clamp(((value - weak) / (strong - weak)) * 100);

const scoreLower = (value: number, weak: number, strong: number) =>
  clamp(((weak - value) / (weak - strong)) * 100);

const scoreSweetSpot = (
  value: number,
  idealLow: number,
  idealHigh: number,
  weakLow: number,
  weakHigh: number,
) => {
  if (value >= idealLow && value <= idealHigh) {
    return 100;
  }

  if (value < idealLow) {
    return scoreHigher(value, weakLow, idealLow);
  }

  return scoreLower(value, weakHigh, idealHigh);
};

const withFinalScore = (
  type: AssetType,
  scores: ScoreComponents,
): ScoreBreakdown => ({
  ...scores,
  final: calculateFinalScore(type, scores),
});

export const calculateFinalScore = (
  type: AssetType,
  scores: ScoreComponents,
) => {
  if (type === 'STOCK') {
    return roundScore(
      scores.quality * 0.3 +
        scores.price * 0.22 +
        scores.income * 0.14 +
        (scores.growth ?? 0) * 0.18 +
        scores.risk * 0.16,
    );
  }

  return roundScore(
    scores.quality * 0.32 +
      scores.price * 0.22 +
      scores.income * 0.26 +
      scores.risk * 0.2,
  );
};

export const calculateStockScore = (
  asset: StockAssetInput,
): ScoreBreakdown => {
  const indicators = asset.indicators;

  const quality = roundScore(
    average([
      scoreHigher(indicators.roe, 8, 24),
      scoreHigher(indicators.roic, 6, 22),
      scoreHigher(indicators.netMargin, 6, 28),
      scoreLower(indicators.debtToEbitda, 4.5, 0.5),
      indicators.earningsStability,
      indicators.governanceScore,
    ]),
  );

  const price = roundScore(
    average([
      scoreLower(indicators.pe, 32, 8),
      scoreLower(indicators.evEbitda, 18, 6),
      scoreLower(indicators.priceToBook, 4.5, 0.9),
      scoreHigher(indicators.freeCashFlowYield, 2, 11),
    ]),
  );

  const income = roundScore(
    average([
      scoreHigher(indicators.dividendYield, 2, 8),
      scoreSweetSpot(indicators.payoutRatio, 35, 75, 5, 115),
      indicators.earningsStability,
    ]),
  );

  const growth = roundScore(
    average([
      scoreHigher(indicators.revenueCagr, 0, 16),
      scoreHigher(indicators.profitCagr, 0, 18),
      indicators.reinvestmentScore,
    ]),
  );

  const risk = roundScore(
    average([
      scoreLower(indicators.debtToEbitda, 4.5, 0.5),
      indicators.liquidityScore,
      indicators.governanceScore,
      scoreLower(indicators.sectorConcentration, 80, 20),
      indicators.earningsStability,
    ]),
  );

  return withFinalScore(asset.type, { quality, price, income, growth, risk });
};

export const calculateFiiScore = (asset: FiiAssetInput): ScoreBreakdown => {
  const indicators = asset.indicators;

  const occupancyScore = scoreLower(indicators.vacancyRate, 18, 2);

  const quality = roundScore(
    average([
      occupancyScore,
      indicators.assetQualityScore,
      indicators.managementQualityScore,
      indicators.leaseDiversificationScore,
      scoreHigher(indicators.contractDurationYears, 2, 8),
    ]),
  );

  const price = roundScore(
    average([
      scoreLower(indicators.pvp, 1.25, 0.82),
      scoreHigher(indicators.ffoYield, 6, 12),
      scoreHigher(indicators.capRate, 6, 11),
    ]),
  );

  const income = roundScore(
    average([
      scoreHigher(indicators.dividendYield, 7, 12),
      scoreSweetSpot(indicators.payoutRatio, 78, 96, 55, 115),
      indicators.distributionStability,
    ]),
  );

  const risk = roundScore(
    average([
      occupancyScore,
      scoreLower(indicators.tenantConcentration, 55, 12),
      indicators.liquidityScore,
      scoreLower(indicators.leverage, 35, 0),
      scoreLower(indicators.defaultRate, 8, 0),
      indicators.managementQualityScore,
    ]),
  );

  return withFinalScore(asset.type, { quality, price, income, risk });
};

export const getStatusLabel = (scores: ScoreBreakdown): AssetStatus => {
  if (scores.quality >= 78 && scores.price < 55 && scores.risk >= 58) {
    return 'Excelente, mas caro';
  }

  if (scores.price >= 70 && scores.risk < 55) {
    return 'Barato, mas arriscado';
  }

  if (
    scores.final >= 82 &&
    scores.quality >= 72 &&
    scores.price >= 58 &&
    scores.risk >= 62
  ) {
    return 'Oportunidade interessante';
  }

  if (scores.final >= 68 && scores.risk >= 50) {
    return 'Atrativo com cautela';
  }

  return 'Fora dos filtros';
};

export const getFocusTags = (scores: ScoreBreakdown, type: AssetType) => {
  const tags: string[] = [];

  if (scores.income >= 75) {
    tags.push('income');
  }

  if (type === 'STOCK' && (scores.growth ?? 0) >= 72) {
    tags.push('growth');
  }

  const balancedMinimums = [
    scores.quality,
    scores.price,
    scores.income,
    scores.risk,
    type === 'STOCK' ? scores.growth ?? 0 : 70,
  ];

  if (scores.final >= 70 && balancedMinimums.every((score) => score >= 58)) {
    tags.push('balanced');
  }

  return tags;
};

export const calculateScoresForAsset = (asset: AssetInput) =>
  asset.type === 'STOCK'
    ? calculateStockScore(asset)
    : calculateFiiScore(asset);

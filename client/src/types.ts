export type AssetType = 'STOCK' | 'FII';

export type AssetStatus =
  | 'Oportunidade interessante'
  | 'Atrativo com cautela'
  | 'Excelente, mas caro'
  | 'Barato, mas arriscado'
  | 'Fora dos filtros';

export interface ScoreBreakdown {
  quality: number;
  price: number;
  income: number;
  growth?: number;
  risk: number;
  final: number;
}

export interface AssetMetrics {
  precoAtual?: number;
  valorDeMercado?: number;
  volume?: number;
  dividendYield?: number;
  pvp?: number;
  pl?: number;
  evEbitda?: number;
  roe?: number;
  margemLiquida?: number;
  crescimentoReceita?: number;
  crescimentoLucro?: number;
  beta?: number;
  patrimonioLiquido?: number;
  totalInvestidores?: number;
  scoreValuation?: number;
  scoreRisco?: number;
}

export type FiiKind =
  | 'PAPEL'
  | 'TIJOLO'
  | 'HIBRIDO'
  | 'FOF'
  | 'DESENVOLVIMENTO'
  | 'OUTRO'
  | 'NAO_IDENTIFICADO';

export type FiiDiversificationLevel =
  | 'alta'
  | 'media'
  | 'baixa'
  | 'nao_disponivel'
  | 'nao_aplicavel';

export type FiiCreditRiskLevel =
  | 'baixo'
  | 'moderado'
  | 'alto'
  | 'nao_disponivel'
  | 'nao_aplicavel';

export interface FiiProfile {
  kind: FiiKind;
  typeLabel: string;
  segment: string;
  diversification: FiiDiversificationLevel;
  diversificationLabel: string;
  diversificationSummary: string;
  creditRisk: FiiCreditRiskLevel;
  creditRiskLabel: string;
  creditRiskConfidence: 'baixa' | 'media' | 'alta' | 'nao_aplicavel';
  creditRiskSummary: string;
  paperRiskDrivers: string[];
  brickRiskDrivers: string[];
  dataSources: string[];
}

export type SourceStatus =
  | 'fresh'
  | 'cached'
  | 'stale'
  | 'insufficient'
  | 'unavailable'
  | 'permission-denied';

export interface Asset {
  rank: number;
  ticker: string;
  name: string;
  type: AssetType;
  sector: string;
  segment: string;
  summary: string;
  statusLabel: AssetStatus;
  focusTags: string[];
  scores: ScoreBreakdown;
  indicators: Record<string, number>;
  metrics: AssetMetrics;
  fiiProfile?: FiiProfile;
  positivePoints: string[];
  riskPoints: string[];
  valuationNotes: string[];
  dividendNotes: string[];
  dataQuality: 'valid' | 'insufficient';
  sourceStatus: SourceStatus;
  stale: boolean;
  dataSource: string;
  lastUpdated: string;
  scoreSnapshotId?: number;
}

export interface InsufficientDataAsset {
  ticker: string;
  type: AssetType;
  reason: string;
  missingFields: string[];
  sourceStatus: SourceStatus;
  stale: boolean;
  dataSource: string;
}

export interface FailedTicker {
  ticker: string;
  type: AssetType;
  reason: string;
}

export interface ScannerResult {
  lastUpdated: string;
  cacheExpiresAt: string;
  cacheTtlMinutes: number;
  dataMode: 'brapi-amplo' | 'brapi-limitado-sem-token';
  warnings: string[];
  totalAssets: number;
  successfulFreshFetches: number;
  usedCachedData: number;
  staleAssets: number;
  universe: {
    stocks: number;
    fiis: number;
    total: number;
  };
  analyzedCount: number;
  insufficientCount: number;
  failedTickers: FailedTicker[];
  assets: Asset[];
  bestOverall: Asset[];
  bestStocks: Asset[];
  bestFiis: Asset[];
  bestIncome: Asset[];
  bestGrowth: Asset[];
  excellentButExpensive: Asset[];
  cheapButRisky: Asset[];
  insufficientData: InsufficientDataAsset[];
}

export interface AiAnalysisResponse {
  analysis: string;
  source: 'openai' | 'fallback' | 'cache';
}

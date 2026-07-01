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

export interface BaseAssetInput {
  ticker: string;
  name: string;
  type: AssetType;
  sector: string;
  segment: string;
  summary: string;
  positivePoints: string[];
  riskPoints: string[];
  valuationNotes: string[];
  dividendNotes: string[];
}

export interface StockIndicators {
  roe: number;
  roic: number;
  netMargin: number;
  debtToEbitda: number;
  pe: number;
  evEbitda: number;
  priceToBook: number;
  dividendYield: number;
  payoutRatio: number;
  revenueCagr: number;
  profitCagr: number;
  freeCashFlowYield: number;
  earningsStability: number;
  liquidityScore: number;
  governanceScore: number;
  sectorConcentration: number;
  reinvestmentScore: number;
}

export interface FiiIndicators {
  vacancyRate: number;
  pvp: number;
  dividendYield: number;
  payoutRatio: number;
  ffoYield: number;
  capRate: number;
  tenantConcentration: number;
  assetQualityScore: number;
  managementQualityScore: number;
  distributionStability: number;
  liquidityScore: number;
  leverage: number;
  defaultRate: number;
  contractDurationYears: number;
  leaseDiversificationScore: number;
}

export interface StockAssetInput extends BaseAssetInput {
  type: 'STOCK';
  indicators: StockIndicators;
}

export interface FiiAssetInput extends BaseAssetInput {
  type: 'FII';
  indicators: FiiIndicators;
}

export type AssetInput = StockAssetInput | FiiAssetInput;

export type FundamentalIndicators = StockIndicators | FiiIndicators;

export interface Asset extends BaseAssetInput {
  rank: number;
  statusLabel: AssetStatus;
  focusTags: string[];
  scores: ScoreBreakdown;
  indicators: FundamentalIndicators;
}

export interface AiAnalysisResponse {
  analysis: string;
  source: 'openai' | 'fallback';
}

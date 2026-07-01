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
  positivePoints: string[];
  riskPoints: string[];
  valuationNotes: string[];
  dividendNotes: string[];
}

export interface AiAnalysisResponse {
  analysis: string;
  source: 'openai' | 'fallback';
}

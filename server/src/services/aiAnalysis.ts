import OpenAI from 'openai';
import crypto from 'node:crypto';

import type {
  AiAnalysisResponse,
  Asset,
  ScannerInsightItem,
  ScannerInsightResponse,
  ScannerResult,
} from '../types';
import { getPrisma } from '../db/prisma';
import { ensureAssetExistsForAnalysis } from './marketRefreshService';
import { buildLocalAnalysis } from './localAnalysis';

const prohibitedTerms = [
  'buy',
  'sell',
  'guaranteed return',
  'comprar',
  'vender',
  'compra',
  'venda',
  'retorno garantido',
  'recomendacao personalizada',
  'recomendação personalizada',
];

const hasProhibitedTerms = (text: string) => {
  const normalized = text.toLowerCase();
  return prohibitedTerms.some((term) => normalized.includes(term));
};

const useOpenAiWebSearch = () =>
  process.env.OPENAI_ENABLE_WEB_SEARCH === 'true';

let scannerInsightCache:
  | {
      key: string;
      value: ScannerInsightResponse;
    }
  | undefined;

const buildPrompt = (asset: Asset) => `
Você é um analista educacional de fundamentos para investidores brasileiros.
Escreva em português do Brasil, de forma clara e profissional.

Regras obrigatorias:
- Não use linguagem de recomendação personalizada.
- Não use estes termos no texto final: buy, sell, guaranteed return, comprar, vender, compra, venda, retorno garantido.
- Não prometa rentabilidade.
- Explique que a análise é educacional e baseada apenas nos dados objetivos enviados.
- Reforce que os indicadores enviados vieram das fontes listadas no JSON e podem ter limitações de cobertura, atraso ou campos ausentes.
- Não invente carteira, imóveis, devedores, garantias, ratings, indexadores ou concentrações.
- Se uma informação não estiver nos dados enviados ou em fonte pesquisada com evidência, diga claramente que ela não está disponível.
- Quando usar informações de busca web, cite a fonte no próprio texto de forma curta.

Explique:
- por que o ativo pontuou bem ou mal;
- fatores de qualidade;
- fatores de preco e valuation;
- dividendos ou renda;
- crescimento quando aplicavel;
- principais riscos;
- o que monitorar nos proximos resultados.

Se o ativo for FII, aprofunde também:
- se parece ser fundo de papel, tijolo, híbrido, FoF ou desenvolvimento;
- para fundo de papel, exposição a CRI/CRA, sinais de risco de crédito, necessidade de checar devedores, garantias, subordinação, rating e indexadores;
- para fundo de tijolo, diversificação por imóvel/região/inquilino quando houver dado, vacância, contratos e qualidade dos ativos;
- diferença entre dado confirmado e ponto que depende de relatório gerencial.

Dados do ativo:
${JSON.stringify(
  {
    ticker: asset.ticker,
    name: asset.name,
    type: asset.type,
    sector: asset.sector,
    segment: asset.segment,
    dataSource: asset.dataSource,
    lastUpdated: asset.lastUpdated,
    statusLabel: asset.statusLabel,
    scores: asset.scores,
    indicators: asset.indicators,
    fiiProfile: asset.fiiProfile,
    positivePoints: asset.positivePoints,
    riskPoints: asset.riskPoints,
    valuationNotes: asset.valuationNotes,
    dividendNotes: asset.dividendNotes,
  },
  null,
  2,
)}
`;

const buildAnalysisInput = (asset: Asset) => ({
  ticker: asset.ticker,
  name: asset.name,
  type: asset.type,
  sector: asset.sector,
  segment: asset.segment,
  statusLabel: asset.statusLabel,
  scores: asset.scores,
  indicators: asset.indicators,
  metrics: asset.metrics,
  fiiProfile: asset.fiiProfile,
  positivePoints: asset.positivePoints,
  riskPoints: asset.riskPoints,
  valuationNotes: asset.valuationNotes,
  dividendNotes: asset.dividendNotes,
  scoreSnapshotId: asset.scoreSnapshotId,
});

const compactAssetForScannerInsight = (asset: Asset) => ({
  ticker: asset.ticker,
  name: asset.name,
  type: asset.type,
  statusLabel: asset.statusLabel,
  finalScore: asset.scores.final,
  scores: asset.scores,
  dividendYield: asset.metrics.dividendYield,
  pvp: asset.metrics.pvp,
  pl: asset.metrics.pl,
  roe: asset.metrics.roe,
  sector: asset.sector,
  segment: asset.segment,
  fiiProfile: asset.fiiProfile
    ? {
        typeLabel: asset.fiiProfile.typeLabel,
        diversificationLabel: asset.fiiProfile.diversificationLabel,
        creditRiskLabel: asset.fiiProfile.creditRiskLabel,
        creditRiskConfidence: asset.fiiProfile.creditRiskConfidence,
      }
    : undefined,
  positivePoints: asset.positivePoints.slice(0, 2),
  riskPoints: asset.riskPoints.slice(0, 2),
  valuationNotes: asset.valuationNotes.slice(0, 2),
});

const getScannerInsightCacheKey = (scan: ScannerResult) =>
  [
    scan.lastUpdated,
    scan.assets.slice(0, 8).map((asset) => `${asset.ticker}:${asset.scores.final}`).join('|'),
    scan.failedTickers.length,
    scan.insufficientData.length,
  ].join('::');

const buildLocalScannerInsight = (
  scan: ScannerResult,
  source: ScannerInsightResponse['source'] = 'fallback',
): ScannerInsightResponse => {
  const topAssets = scan.bestOverall.slice(0, 3);
  const expensiveAssets = scan.excellentButExpensive.slice(0, 2);
  const riskyAssets = scan.cheapButRisky.slice(0, 2);
  const staleLabel =
    scan.staleAssets > 0
      ? `${scan.staleAssets} ativo(s) com dados defasados`
      : 'dados sem defasagem relevante no snapshot atual';

  return {
    source,
    generatedAt: new Date().toISOString(),
    scanLastUpdated: scan.lastUpdated,
    overview: `O radar analisou ${scan.analyzedCount} de ${scan.universe.total} ativos. A leitura prioriza combinações de qualidade, valuation, renda, crescimento e risco, com ${staleLabel}. Os destaques abaixo são pontos de estudo, não recomendações personalizadas.`,
    opportunityHighlights: topAssets.map((asset) => ({
      ticker: asset.ticker,
      title: `${asset.ticker} aparece bem posicionado no ranking`,
      description: `${asset.statusLabel}. Pontuação final ${Math.round(
        asset.scores.final,
      )}, com qualidade ${Math.round(asset.scores.quality)}, preço ${Math.round(
        asset.scores.price,
      )}, renda ${Math.round(asset.scores.income)} e risco ${Math.round(
        asset.scores.risk,
      )}.`,
    })),
    cautionHighlights: [
      ...expensiveAssets.map((asset) => ({
        ticker: asset.ticker,
        title: `${asset.ticker} tem qualidade, mas valuation pesa`,
        description: `O ativo entrou em "Excelente, mas caro", sinalizando bons fundamentos relativos com preço menos confortável dentro dos filtros atuais.`,
      })),
      ...riskyAssets.map((asset) => ({
        ticker: asset.ticker,
        title: `${asset.ticker} exige cautela pelo risco`,
        description: `O ativo entrou em "Barato, mas arriscado". O desconto ou yield não deve ser lido isoladamente dos fundamentos e riscos apontados pelo scanner.`,
      })),
    ].slice(0, 4),
    dataGaps: [
      {
        title: 'Ativos fora do ranking por dados insuficientes',
        description: `${scan.insufficientData.length} ativo(s) ficaram fora do ranking por campos ausentes e ${scan.failedTickers.length} ticker(s) tiveram falha de provedor.`,
      },
      {
        title: 'Qualidade das fontes',
        description:
          'Quando a fonte não traz imóveis, devedores, garantias, ratings ou concentração de CRIs, o app sinaliza a lacuna em vez de completar com suposições.',
      },
    ],
    monitorPoints: [
      {
        title: 'Atualização dos dados',
        description: `Acompanhar se a próxima varredura reduz dados em cache (${scan.usedCachedData}) e dados defasados (${scan.staleAssets}).`,
      },
      {
        title: 'Coerência entre preço e qualidade',
        description:
          'Priorizar a leitura combinada entre qualidade, valuation, renda/crescimento e risco, evitando olhar apenas dividend yield, P/VP ou queda de preço.',
      },
    ],
  };
};

const normalizeInsightItems = (items: unknown): ScannerInsightItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined;
      }

      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const description =
        typeof record.description === 'string' ? record.description.trim() : '';
      const ticker = typeof record.ticker === 'string' ? record.ticker.trim() : undefined;

      if (!title || !description) {
        return undefined;
      }

      return ticker ? { ticker, title, description } : { title, description };
    })
    .filter((item): item is ScannerInsightItem => Boolean(item))
    .slice(0, 5);
};

const normalizeScannerInsight = (
  payload: unknown,
  scan: ScannerResult,
): ScannerInsightResponse | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const overview = typeof record.overview === 'string' ? record.overview.trim() : '';

  if (!overview) {
    return undefined;
  }

  return {
    source: 'openai',
    generatedAt: new Date().toISOString(),
    scanLastUpdated: scan.lastUpdated,
    overview,
    opportunityHighlights: normalizeInsightItems(record.opportunityHighlights),
    cautionHighlights: normalizeInsightItems(record.cautionHighlights),
    dataGaps: normalizeInsightItems(record.dataGaps),
    monitorPoints: normalizeInsightItems(record.monitorPoints),
  };
};

const buildScannerInsightPrompt = (scan: ScannerResult) => `
Você é uma camada de inteligência educacional para um scanner de ações brasileiras e FIIs.
Analise o snapshot abaixo e gere uma leitura profissional do radar em português do Brasil.

Regras obrigatórias:
- Não use linguagem de recomendação personalizada.
- Não use estes termos no texto final: buy, sell, guaranteed return, comprar, vender, compra, venda, retorno garantido.
- Não diga o que o usuário deve fazer.
- Não prometa rentabilidade.
- Não invente dados, imóveis, CRIs, devedores, ratings, garantias, indexadores ou concentração.
- Se houver lacuna de dados, destaque a lacuna como ponto de atenção.
- Explique por que alguns ativos se destacaram objetivamente no scanner.
- Use linguagem de research educacional, como "passou melhor pelos filtros", "merece estudo adicional", "ponto de atenção" e "monitorar".

Responda somente JSON válido neste formato:
{
  "overview": "resumo executivo em 2 ou 3 frases",
  "opportunityHighlights": [
    { "ticker": "TICKER", "title": "título curto", "description": "por que apareceu bem no radar" }
  ],
  "cautionHighlights": [
    { "ticker": "TICKER", "title": "título curto", "description": "risco, valuation ou fragilidade" }
  ],
  "dataGaps": [
    { "title": "título curto", "description": "lacuna de dados ou limitação de fonte" }
  ],
  "monitorPoints": [
    { "title": "título curto", "description": "o que acompanhar nos próximos resultados ou próximas varreduras" }
  ]
}

Snapshot:
${JSON.stringify(
  {
    lastUpdated: scan.lastUpdated,
    universe: scan.universe,
    analyzedCount: scan.analyzedCount,
    insufficientCount: scan.insufficientCount,
    failedTickers: scan.failedTickers.slice(0, 10),
    dataStatus: {
      fresh: scan.successfulFreshFetches,
      cached: scan.usedCachedData,
      stale: scan.staleAssets,
      dataMode: scan.dataMode,
    },
    bestOverall: scan.bestOverall.slice(0, 6).map(compactAssetForScannerInsight),
    bestStocks: scan.bestStocks.slice(0, 4).map(compactAssetForScannerInsight),
    bestFiis: scan.bestFiis.slice(0, 4).map(compactAssetForScannerInsight),
    excellentButExpensive: scan.excellentButExpensive
      .slice(0, 4)
      .map(compactAssetForScannerInsight),
    cheapButRisky: scan.cheapButRisky.slice(0, 4).map(compactAssetForScannerInsight),
    insufficientData: scan.insufficientData.slice(0, 10),
    warnings: scan.warnings,
  },
  null,
  2,
)}
`;

const getInputHash = (asset: Asset) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(buildAnalysisInput(asset)))
    .digest('hex');

const saveAnalysis = async (
  asset: Asset,
  analysisText: string,
  inputHash: string,
  model: string,
) => {
  await ensureAssetExistsForAnalysis(asset);

  return getPrisma().aiAnalysis.upsert({
    where: {
      ticker_inputHash: {
        ticker: asset.ticker,
        inputHash,
      },
    },
    update: {
      analysisText,
      model,
      scoreSnapshotId: asset.scoreSnapshotId,
    },
    create: {
      ticker: asset.ticker,
      inputHash,
      analysisText,
      model,
      scoreSnapshotId: asset.scoreSnapshotId,
    },
  });
};

export const generateEducationalAnalysis = async (
  asset: Asset,
): Promise<AiAnalysisResponse> => {
  const inputHash = getInputHash(asset);
  const cachedAnalysis = await getPrisma().aiAnalysis.findUnique({
    where: {
      ticker_inputHash: {
        ticker: asset.ticker,
        inputHash,
      },
    },
  });

  if (cachedAnalysis) {
    return {
      analysis: cachedAnalysis.analysisText,
      source: 'cache',
    };
  }

  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';

  if (!process.env.OPENAI_API_KEY) {
    const analysis = buildLocalAnalysis(asset);
    await saveAnalysis(asset, analysis, inputHash, 'fallback-local');

    return {
      analysis,
      source: 'fallback',
    };
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const tools = useOpenAiWebSearch()
      ? [
          {
            type: 'web_search_preview' as const,
            search_context_size: 'medium' as const,
            user_location: {
              type: 'approximate' as const,
              country: 'BR' as const,
            },
          },
        ]
      : undefined;

    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content:
            'Você produz análises fundamentalistas educacionais, objetivas e sem recomendação personalizada.',
        },
        {
          role: 'user',
          content: buildPrompt(asset),
        },
      ],
      tools,
      max_output_tokens: 1200,
    });

    const output = response.output_text?.trim();

    if (!output || hasProhibitedTerms(output)) {
      const analysis = buildLocalAnalysis(asset);
      await saveAnalysis(asset, analysis, inputHash, 'fallback-local');

      return {
        analysis,
        source: 'fallback',
      };
    }

    await saveAnalysis(asset, output, inputHash, model);

    return {
      analysis: output,
      source: 'openai',
    };
  } catch (error) {
    console.error('Falha ao gerar análise com OpenAI:', error);
    const analysis = buildLocalAnalysis(asset);
    await saveAnalysis(asset, analysis, inputHash, 'fallback-local');

    return {
      analysis,
      source: 'fallback',
    };
  }
};

export const generateScannerInsight = async (
  scan: ScannerResult,
): Promise<ScannerInsightResponse> => {
  const cacheKey = getScannerInsightCacheKey(scan);

  if (scannerInsightCache?.key === cacheKey) {
    return {
      ...scannerInsightCache.value,
      source: 'cache',
    };
  }

  const fallback = () => {
    const insight = buildLocalScannerInsight(scan);
    scannerInsightCache = { key: cacheKey, value: insight };
    return insight;
  };

  if (!process.env.OPENAI_API_KEY) {
    return fallback();
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content:
            'Você gera leituras educacionais de radar de mercado, sem recomendação personalizada e sem inventar dados.',
        },
        {
          role: 'user',
          content: buildScannerInsightPrompt(scan),
        },
      ],
      max_output_tokens: 1400,
    });

    const output = response.output_text?.trim();
    const parsed = output ? JSON.parse(output) : undefined;
    const insight = normalizeScannerInsight(parsed, scan);

    if (!insight || hasProhibitedTerms(JSON.stringify(insight))) {
      return fallback();
    }

    scannerInsightCache = { key: cacheKey, value: insight };
    return insight;
  } catch (error) {
    console.error('Falha ao gerar leitura inteligente do scanner:', error);
    return fallback();
  }
};

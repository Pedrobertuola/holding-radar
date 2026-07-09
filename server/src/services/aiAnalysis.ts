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

interface ScannerInsightOptions {
  forceRefresh?: boolean;
  includeNews?: boolean;
}

let scannerInsightCache:
  | {
      key: string;
      value: ScannerInsightResponse;
    }
  | undefined;

const SCANNER_INSIGHT_VERSION = 'v3-news-selection';

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

const getScannerInsightCacheKey = (scan: ScannerResult, allowNewsSearch: boolean) =>
  [
    SCANNER_INSIGHT_VERSION,
    scan.lastUpdated,
    allowNewsSearch ? 'web-search-on' : 'web-search-off',
    scan.assets.slice(0, 8).map((asset) => `${asset.ticker}:${asset.scores.final}`).join('|'),
    scan.failedTickers.length,
    scan.insufficientData.length,
  ].join('::');

const formatInsightScore = (value: number) => Math.round(value).toString();

const formatInsightPercent = (value?: number) =>
  value === undefined
    ? 'não informado'
    : `${(value * 100).toLocaleString('pt-BR', {
        maximumFractionDigits: 1,
      })}%`;

const formatInsightMultiple = (value?: number) =>
  value === undefined
    ? 'não informado'
    : value.toLocaleString('pt-BR', {
        maximumFractionDigits: 2,
      });

const describeMainStrength = (asset: Asset) => {
  const entries = [
    ['qualidade', asset.scores.quality],
    ['valuation/preço', asset.scores.price],
    ['renda', asset.scores.income],
    ...(asset.scores.growth !== undefined
      ? ([['crescimento', asset.scores.growth]] as [string, number][])
      : []),
    ['segurança', asset.scores.risk],
  ] as [string, number][];
  const [label, score] = entries.sort((a, b) => b[1] - a[1])[0];

  return `${label} foi o fator mais forte (${formatInsightScore(score)}/100)`;
};

const describeMainTradeOff = (asset: Asset) => {
  const entries = [
    ['qualidade', asset.scores.quality],
    ['valuation/preço', asset.scores.price],
    ['renda', asset.scores.income],
    ...(asset.scores.growth !== undefined
      ? ([['crescimento', asset.scores.growth]] as [string, number][])
      : []),
    ['segurança', asset.scores.risk],
  ] as [string, number][];
  const [label, score] = entries.sort((a, b) => a[1] - b[1])[0];

  return `${label} foi o ponto relativamente mais fraco (${formatInsightScore(score)}/100)`;
};

const describeAssetContext = (asset: Asset) => {
  if (asset.type === 'FII') {
    const fiiType = asset.fiiProfile?.typeLabel ?? 'tipo de FII não identificado';
    const creditRisk = asset.fiiProfile?.creditRiskLabel ?? 'risco de CRIs não informado';
    const diversification =
      asset.fiiProfile?.diversificationLabel ?? 'diversificação não informada';

    return `${fiiType}; P/VP ${formatInsightMultiple(
      asset.metrics.pvp,
    )}; DY ${formatInsightPercent(
      asset.metrics.dividendYield,
    )}; diversificação ${diversification}; leitura de CRIs: ${creditRisk}.`;
  }

  return `Setor ${asset.sector}; P/L ${formatInsightMultiple(
    asset.metrics.pl,
  )}; ROE ${formatInsightPercent(
    asset.metrics.roe,
  )}; DY ${formatInsightPercent(asset.metrics.dividendYield)}.`;
};

const buildOpportunityDescription = (asset: Asset) =>
  [
    `${asset.statusLabel}.`,
    `${describeMainStrength(asset)} e ${describeMainTradeOff(asset)}.`,
    describeAssetContext(asset),
    `A nota de segurança ${formatInsightScore(
      asset.scores.risk,
    )}/100 significa menor risco relativo dentro do modelo, não ausência de risco.`,
  ].join(' ');

const buildValuationCautionDescription = (asset: Asset) =>
  [
    `O ativo aparece como "Excelente, mas caro" porque a qualidade ficou forte (${formatInsightScore(
      asset.scores.quality,
    )}/100), mas o preço/valuation não acompanhou no mesmo nível (${formatInsightScore(
      asset.scores.price,
    )}/100).`,
    describeAssetContext(asset),
    'A leitura inteligente trata isso como bom ativo para estudo, porém com margem de segurança menor no preço atual.',
  ].join(' ');

const buildRiskyCautionDescription = (asset: Asset) =>
  [
    `O ativo aparece como "Barato, mas arriscado" porque o preço ou a renda chamam atenção, mas a qualidade ou a segurança relativa ficam mais pressionadas.`,
    `Forças: ${describeMainStrength(asset)}. Fragilidade: ${describeMainTradeOff(asset)}.`,
    describeAssetContext(asset),
  ].join(' ');

const buildLocalScannerInsight = (
  scan: ScannerResult,
  source: ScannerInsightResponse['source'] = 'fallback',
): ScannerInsightResponse => {
  const topAssets = scan.bestOverall.slice(0, 3);
  const balancedAssets = scan.assets
    .filter(
      (asset) =>
        asset.scores.quality >= 65 &&
        asset.scores.price >= 55 &&
        asset.scores.risk >= 55,
    )
    .slice(0, 5);
  const expensiveAssets = scan.excellentButExpensive.slice(0, 2);
  const riskyAssets = scan.cheapButRisky.slice(0, 2);
  const staleLabel =
    scan.staleAssets > 0
      ? `${scan.staleAssets} ativo(s) com dados defasados`
      : 'dados sem defasagem relevante no snapshot atual';

  return {
    source,
    usedNewsSearch: false,
    generatedAt: new Date().toISOString(),
    scanLastUpdated: scan.lastUpdated,
    overview: `O radar analisou ${scan.analyzedCount} de ${scan.universe.total} ativos. A leitura não escolhe ativos por um único indicador: ela procura equilíbrio entre qualidade, valuation, renda/crescimento e segurança relativa, com ${staleLabel}. Os destaques abaixo mostram hipóteses de estudo e pontos de atenção, não recomendações personalizadas.`,
    aiShortlist: balancedAssets.map((asset) => ({
      ticker: asset.ticker,
      title: `${asset.ticker} entrou na seleção assistida para estudo`,
      description: [
        `${describeMainStrength(asset)} e ${describeMainTradeOff(asset)}.`,
        describeAssetContext(asset),
        `A seleção veio do equilíbrio entre score final ${formatInsightScore(
          asset.scores.final,
        )}/100 e segurança ${formatInsightScore(asset.scores.risk)}/100, não de um único indicador.`,
      ].join(' '),
    })),
    newsContext: [
      {
        title: 'Busca de notícias não usada nesta leitura',
        description:
          'A análise local não consultou notícias. Para incluir contexto recente, configure OPENAI_API_KEY e OPENAI_ENABLE_WEB_SEARCH=true no backend.',
      },
    ],
    opportunityHighlights: topAssets.map((asset) => ({
      ticker: asset.ticker,
      title: `${asset.ticker} combina força e ponto de atenção claro`,
      description: buildOpportunityDescription(asset),
    })),
    cautionHighlights: [
      ...expensiveAssets.map((asset) => ({
        ticker: asset.ticker,
        title: `${asset.ticker} tem qualidade, mas valuation pesa`,
        description: buildValuationCautionDescription(asset),
      })),
      ...riskyAssets.map((asset) => ({
        ticker: asset.ticker,
        title: `${asset.ticker} tem preço chamativo, mas segurança menor`,
        description: buildRiskyCautionDescription(asset),
      })),
    ].slice(0, 4),
    dataGaps: [
      {
        title: 'Ativos fora do ranking por dados insuficientes',
        description: `${scan.insufficientData.length} ativo(s) ficaram fora do ranking por campos ausentes e ${scan.failedTickers.length} ticker(s) tiveram falha de provedor. Esses ativos não entram como oportunidade porque o modelo não tem evidência mínima para pontuar.`,
      },
      {
        title: 'Dados defasados reduzem confiança',
        description: `${scan.usedCachedData} ativo(s) usaram cache e ${scan.staleAssets} aparecem como defasados. A leitura continua útil para triagem, mas perde força como fotografia do dia.`,
      },
      {
        title: 'Lacunas qualitativas em FIIs',
        description:
          'Quando a fonte não traz imóveis, devedores, garantias, ratings, indexadores ou concentração de CRIs, o app sinaliza a lacuna em vez de completar com suposições.',
      },
    ],
    monitorPoints: [
      {
        title: 'Atualização dos dados',
        description: `Monitorar se a próxima varredura reduz dados em cache (${scan.usedCachedData}) e dados defasados (${scan.staleAssets}), porque isso aumenta a confiança do ranking.`,
      },
      {
        title: 'Coerência entre preço e qualidade',
        description:
          'Separar ativos que são bons e caros de ativos baratos por fragilidade. O radar fica mais útil quando mostra o motivo do desconto, não só o desconto.',
      },
      {
        title: 'Segurança não é ausência de risco',
        description:
          'A nota de segurança é positiva: quanto maior, menor o risco relativo no modelo. Ela não elimina riscos de mercado, dados atrasados, eventos corporativos ou problemas específicos de cada ativo.',
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
    usedNewsSearch: false,
    generatedAt: new Date().toISOString(),
    scanLastUpdated: scan.lastUpdated,
    overview,
    aiShortlist: normalizeInsightItems(record.aiShortlist),
    newsContext: normalizeInsightItems(record.newsContext),
    opportunityHighlights: normalizeInsightItems(record.opportunityHighlights),
    cautionHighlights: normalizeInsightItems(record.cautionHighlights),
    dataGaps: normalizeInsightItems(record.dataGaps),
    monitorPoints: normalizeInsightItems(record.monitorPoints),
  };
};

const parseJsonObject = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];

    if (fenced) {
      return JSON.parse(fenced);
    }

    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(value.slice(start, end + 1));
    }

    throw new Error('Resposta da IA não continha JSON válido.');
  }
};


const buildScannerInsightPrompt = (
  scan: ScannerResult,
  options: { allowNewsSearch: boolean },
) => `
Você é uma camada de inteligência educacional para um scanner de ações brasileiras e FIIs.
Analise o snapshot abaixo e gere uma leitura profissional do radar em português do Brasil.

Regras obrigatórias:
- Não use linguagem de recomendação personalizada.
- Não use estes termos no texto final: buy, sell, guaranteed return, comprar, vender, compra, venda, retorno garantido.
- Não diga o que o usuário deve fazer.
- Não prometa rentabilidade.
- Não invente dados, imóveis, CRIs, devedores, ratings, garantias, indexadores ou concentração.
- Se houver lacuna de dados, destaque a lacuna como ponto de atenção.
- Explique por que alguns ativos se destacaram objetivamente no scanner, sem repetir apenas os números.
- Compare forças e fragilidades: qualidade versus preço, renda versus sustentabilidade, crescimento versus segurança.
- Trate scores.risk como nota de segurança relativa: quanto maior, menor o risco relativo no modelo.
- Use linguagem de research educacional, como "passou melhor pelos filtros", "merece estudo adicional", "ponto de atenção" e "monitorar".
- A seleção assistida pela IA deve escolher ativos para estudo dentro do universo analisado, combinando fundamentos, valuation, segurança, tipo de ativo, lacunas de dados e contexto recente.
- A seleção assistida não deve ser igual automaticamente ao ranking por score final.
- Se houver notícia relevante recente, explique como ela pode mudar a leitura do ativo, do setor ou do FII.
- Cite fontes curtas quando usar notícia ou contexto externo.
${options.allowNewsSearch
  ? '- Use busca web para verificar notícias relevantes recentes sobre os principais ativos, setores, FIIs e cenário macro brasileiro. Priorize fatos relevantes dos últimos 30 dias quando disponíveis.'
  : '- A ferramenta de busca web não está disponível nesta execução. Não invente notícias; limite o contexto externo ao que estiver no snapshot.'}

Responda somente JSON válido neste formato:
{
  "overview": "resumo executivo em 2 ou 3 frases",
  "aiShortlist": [
    { "ticker": "TICKER", "title": "por que entrou na seleção assistida", "description": "síntese interpretativa com fundamentos, valuation, segurança e contexto" }
  ],
  "newsContext": [
    { "ticker": "TICKER opcional", "title": "notícia ou contexto relevante", "description": "como isso afeta a leitura educacional, citando fonte curta se houver" }
  ],
  "opportunityHighlights": [
    { "ticker": "TICKER", "title": "título curto", "description": "por que apareceu bem no radar, citando também o principal ponto fraco" }
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
  options: ScannerInsightOptions = {},
): Promise<ScannerInsightResponse> => {
  const allowNewsSearch = Boolean(options.includeNews) && useOpenAiWebSearch();
  const cacheKey = getScannerInsightCacheKey(scan, allowNewsSearch);

  if (!options.forceRefresh && scannerInsightCache?.key === cacheKey) {
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
    const tools = allowNewsSearch
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
            'Você gera leituras educacionais de radar de mercado, sem recomendação personalizada e sem inventar dados.',
        },
        {
          role: 'user',
          content: buildScannerInsightPrompt(scan, { allowNewsSearch }),
        },
      ],
      tools,
      max_output_tokens: 2200,
    });

    const output = response.output_text?.trim();
    const parsed = output ? parseJsonObject(output) : undefined;
    const insight = normalizeScannerInsight(parsed, scan);

    if (!insight || hasProhibitedTerms(JSON.stringify(insight))) {
      return fallback();
    }

    const insightWithMetadata = {
      ...insight,
      usedNewsSearch: allowNewsSearch,
    };

    scannerInsightCache = { key: cacheKey, value: insightWithMetadata };
    return insightWithMetadata;
  } catch (error) {
    console.error('Falha ao gerar leitura inteligente do scanner:', error);
    return fallback();
  }
};

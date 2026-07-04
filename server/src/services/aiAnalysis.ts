import OpenAI from 'openai';
import crypto from 'node:crypto';

import type { AiAnalysisResponse, Asset } from '../types';
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

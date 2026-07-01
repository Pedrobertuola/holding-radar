import OpenAI from 'openai';

import type { AiAnalysisResponse, Asset } from '../types';
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

const buildPrompt = (asset: Asset) => `
Voce e um analista educacional de fundamentos para investidores brasileiros.
Escreva em portugues do Brasil, de forma clara e profissional.

Regras obrigatorias:
- Nao use linguagem de recomendacao personalizada.
- Nao use estes termos no texto final: buy, sell, guaranteed return, comprar, vender, compra, venda, retorno garantido.
- Nao prometa rentabilidade.
- Explique que a analise e educacional e baseada apenas nos dados objetivos enviados.

Explique:
- por que o ativo pontuou bem ou mal;
- fatores de qualidade;
- fatores de preco e valuation;
- dividendos ou renda;
- crescimento quando aplicavel;
- principais riscos;
- o que monitorar nos proximos resultados.

Dados do ativo:
${JSON.stringify(
  {
    ticker: asset.ticker,
    name: asset.name,
    type: asset.type,
    sector: asset.sector,
    segment: asset.segment,
    statusLabel: asset.statusLabel,
    scores: asset.scores,
    indicators: asset.indicators,
    positivePoints: asset.positivePoints,
    riskPoints: asset.riskPoints,
    valuationNotes: asset.valuationNotes,
    dividendNotes: asset.dividendNotes,
  },
  null,
  2,
)}
`;

export const generateEducationalAnalysis = async (
  asset: Asset,
): Promise<AiAnalysisResponse> => {
  if (!process.env.OPENAI_API_KEY) {
    return {
      analysis: buildLocalAnalysis(asset),
      source: 'fallback',
    };
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'Voce produz analises fundamentalistas educacionais, objetivas e sem recomendacao personalizada.',
        },
        {
          role: 'user',
          content: buildPrompt(asset),
        },
      ],
      max_output_tokens: 1200,
    });

    const output = response.output_text?.trim();

    if (!output || hasProhibitedTerms(output)) {
      return {
        analysis: buildLocalAnalysis(asset),
        source: 'fallback',
      };
    }

    return {
      analysis: output,
      source: 'openai',
    };
  } catch (error) {
    console.error('OpenAI analysis failed:', error);

    return {
      analysis: buildLocalAnalysis(asset),
      source: 'fallback',
    };
  }
};

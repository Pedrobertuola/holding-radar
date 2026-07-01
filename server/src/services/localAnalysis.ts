import type { Asset } from '../types';

const formatScore = (value: number) => `${Math.round(value)}/100`;

export const buildLocalAnalysis = (asset: Asset) => {
  const growthLine =
    asset.type === 'STOCK' && asset.scores.growth !== undefined
      ? `\n\nCrescimento: o score de crescimento foi ${formatScore(
          asset.scores.growth,
        )}. O radar observa evolucao de receita, lucro e capacidade de reinvestimento para entender se o negocio vem expandindo com disciplina.`
      : '';

  return [
    `Analise educacional de ${asset.ticker} - ${asset.name}`,
    '',
    `${asset.summary}`,
    '',
    `Leitura do score: o ativo ficou com score final de ${formatScore(
      asset.scores.final,
    )} e status "${asset.statusLabel}". A classificacao combina qualidade, preco, renda, crescimento quando aplicavel e risco. O objetivo e organizar criterios fundamentalistas, sem considerar perfil individual.`,
    '',
    `Qualidade: o score foi ${formatScore(
      asset.scores.quality,
    )}. Pontos positivos observados: ${asset.positivePoints.join(' ')}`,
    '',
    `Preco e valuation: o score foi ${formatScore(
      asset.scores.price,
    )}. ${asset.valuationNotes.join(' ')}`,
    '',
    `Dividendos e renda: o score foi ${formatScore(
      asset.scores.income,
    )}. ${asset.dividendNotes.join(' ')}`,
    growthLine,
    '',
    `Riscos principais: o score de risco foi ${formatScore(
      asset.scores.risk,
    )}. Pontos de atencao: ${asset.riskPoints.join(' ')}`,
    '',
    'O que monitorar: acompanhar consistencia dos resultados, endividamento, manutencao dos dividendos, revisoes de valuation, eventos regulatorios ou setoriais e qualquer mudanca relevante nos fundamentos que sustentam o score.',
  ]
    .filter(Boolean)
    .join('\n');
};

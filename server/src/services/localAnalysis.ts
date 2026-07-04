import type { Asset } from '../types';

const formatScore = (value: number) => `${Math.round(value)}/100`;

export const buildLocalAnalysis = (asset: Asset) => {
  const growthLine =
    asset.type === 'STOCK' && asset.scores.growth !== undefined
      ? `\n\nCrescimento: a pontuação de crescimento foi ${formatScore(
          asset.scores.growth,
        )}. O radar observa evolução de receita, lucro e capacidade de reinvestimento para entender se o negócio vem expandindo com disciplina.`
      : '';
  const fiiLine = asset.fiiProfile
    ? `\n\nPerfil do FII: o fundo foi classificado como ${asset.fiiProfile.typeLabel}. Diversificação: ${asset.fiiProfile.diversificationLabel}. ${asset.fiiProfile.diversificationSummary} Risco de crédito de CRIs: ${asset.fiiProfile.creditRiskLabel}. ${asset.fiiProfile.creditRiskSummary}`
    : '';

  return [
    `Análise educacional de ${asset.ticker} - ${asset.name}`,
    '',
    `${asset.summary}`,
    '',
    `Leitura da pontuação: o ativo ficou com pontuação final de ${formatScore(
      asset.scores.final,
    )} e status "${asset.statusLabel}". A classificação combina qualidade, preço, renda, crescimento quando aplicável e risco. O objetivo é organizar critérios fundamentalistas sem considerar perfil individual.`,
    '',
    `Qualidade: a pontuação foi ${formatScore(
      asset.scores.quality,
    )}. Pontos positivos observados: ${asset.positivePoints.join(' ')}`,
    '',
    `Preço e valuation: a pontuação foi ${formatScore(
      asset.scores.price,
    )}. ${asset.valuationNotes.join(' ')}`,
    '',
    `Dividendos e renda: a pontuação foi ${formatScore(
      asset.scores.income,
    )}. ${asset.dividendNotes.join(' ')}`,
    fiiLine,
    growthLine,
    '',
    `Riscos principais: a pontuação de risco foi ${formatScore(
      asset.scores.risk,
    )}. Pontos de atenção: ${asset.riskPoints.join(' ')}`,
    '',
    'O que monitorar: acompanhar consistência dos resultados, endividamento, manutenção dos dividendos, revisões de valuation, eventos regulatórios ou setoriais e qualquer mudança relevante nos fundamentos que sustentam a pontuação.',
  ]
    .filter(Boolean)
    .join('\n');
};

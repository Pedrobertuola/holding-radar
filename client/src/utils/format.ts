const indicatorLabels: Record<string, string> = {
  precoAtual: 'Preço atual',
  valorDeMercado: 'Valor de mercado',
  volume: 'Volume',
  pl: 'P/L',
  lpa: 'LPA',
  minima52Semanas: 'Mínima em 52 semanas',
  maxima52Semanas: 'Máxima em 52 semanas',
  pvp: 'P/VP',
  roe: 'ROE',
  roic: 'ROIC',
  netMargin: 'Margem líquida',
  margemLiquida: 'Margem líquida',
  margemEbitda: 'Margem EBITDA',
  debtToEbitda: 'Dívida / EBITDA',
  dividaPatrimonio: 'Dívida / patrimônio',
  pe: 'P/L',
  evEbitda: 'EV / EBITDA',
  priceToBook: 'P/B',
  dividendYield: 'Rendimento de dividendos',
  dividendYieldPatrimonial12m: 'DY patrimonial 12m',
  dividendYieldMensal: 'Dividend yield mensal',
  rendimentoMensalPorCota: 'Rendimento mensal por cota',
  rendimento12mPorCota: 'Rendimento 12m por cota',
  payoutRatio: 'Payout',
  revenueCagr: 'CAGR de receita',
  profitCagr: 'CAGR de lucro',
  freeCashFlowYield: 'Rendimento do FCF',
  earningsStability: 'Estabilidade dos resultados',
  liquidityScore: 'Liquidez',
  governanceScore: 'Governança',
  sectorConcentration: 'Concentração setorial',
  reinvestmentScore: 'Reinvestimento',
  crescimentoReceita: 'Crescimento da receita',
  crescimentoLucro: 'Crescimento do lucro',
  beta: 'Beta',
  vacancyRate: 'Vacância',
  ffoYield: 'Rendimento do FFO',
  capRate: 'Cap rate',
  tenantConcentration: 'Concentração de locatários',
  assetQualityScore: 'Qualidade dos ativos',
  managementQualityScore: 'Qualidade da gestão',
  distributionStability: 'Estabilidade da distribuição',
  leverage: 'Alavancagem',
  defaultRate: 'Inadimplência',
  contractDurationYears: 'Prazo médio dos contratos',
  leaseDiversificationScore: 'Diversificação dos contratos',
  patrimonioLiquido: 'Patrimônio líquido',
  valorPatrimonialCota: 'Valor patrimonial por cota',
  totalAtivos: 'Total de ativos',
  totalInvestidores: 'Total de investidores',
  cotasEmitidas: 'Cotas emitidas',
  imoveis: 'Imóveis e direitos reais',
  imoveisRendaAcabados: 'Imóveis para renda acabados',
  imoveisRendaConstrucao: 'Imóveis para renda em construção',
  criCra: 'CRI/CRA',
  cotasFii: 'Cotas de FIIs',
  liquidezCaixa: 'Disponibilidades',
  totalInvestido: 'Total investido',
  totalPassivo: 'Total do passivo',
};

const percentIndicators = new Set([
  'roe',
  'roic',
  'netMargin',
  'dividendYield',
  'dividendYieldPatrimonial12m',
  'dividendYieldMensal',
  'payoutRatio',
  'revenueCagr',
  'profitCagr',
  'freeCashFlowYield',
  'margemLiquida',
  'margemEbitda',
  'crescimentoReceita',
  'crescimentoLucro',
  'vacancyRate',
  'ffoYield',
  'capRate',
  'tenantConcentration',
  'sectorConcentration',
  'leverage',
  'defaultRate',
]);

const scoreIndicators = new Set([
  'earningsStability',
  'liquidityScore',
  'governanceScore',
  'reinvestmentScore',
  'assetQualityScore',
  'managementQualityScore',
  'distributionStability',
  'leaseDiversificationScore',
]);

const multipleIndicators = new Set([
  'debtToEbitda',
  'pe',
  'evEbitda',
  'priceToBook',
  'pvp',
  'pl',
  'evEbitda',
  'dividaPatrimonio',
]);

const currencyIndicators = new Set([
  'precoAtual',
  'lpa',
  'rendimentoMensalPorCota',
  'rendimento12mPorCota',
  'minima52Semanas',
  'maxima52Semanas',
  'valorDeMercado',
  'patrimonioLiquido',
  'valorPatrimonialCota',
  'totalAtivos',
  'imoveis',
  'imoveisRendaAcabados',
  'imoveisRendaConstrucao',
  'criCra',
  'cotasFii',
  'liquidezCaixa',
  'totalInvestido',
  'totalPassivo',
]);

const integerIndicators = new Set([
  'volume',
  'totalInvestidores',
  'cotasEmitidas',
]);

export const formatScore = (score: number) => `${Math.round(score)}/100`;

export const formatShortScore = (score: number) => `${Math.round(score)}`;

export const getIndicatorLabel = (key: string) => indicatorLabels[key] ?? key;

export const formatIndicatorValue = (key: string, value: number) => {
  if (percentIndicators.has(key)) {
    return `${(value * 100).toLocaleString('pt-BR', {
      maximumFractionDigits: 1,
    })}%`;
  }

  if (scoreIndicators.has(key)) {
    return formatScore(value);
  }

  if (multipleIndicators.has(key)) {
    return `${value.toFixed(1)}x`;
  }

  if (currencyIndicators.has(key)) {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    });
  }

  if (integerIndicators.has(key)) {
    return value.toLocaleString('pt-BR', {
      maximumFractionDigits: 0,
    });
  }

  if (key === 'contractDurationYears') {
    return `${value.toFixed(1)} anos`;
  }

  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  });
};

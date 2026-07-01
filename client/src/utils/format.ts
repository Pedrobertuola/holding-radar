const indicatorLabels: Record<string, string> = {
  roe: 'ROE',
  roic: 'ROIC',
  netMargin: 'Net margin',
  debtToEbitda: 'Debt / EBITDA',
  pe: 'P/E',
  evEbitda: 'EV / EBITDA',
  priceToBook: 'P/B',
  dividendYield: 'Dividend yield',
  payoutRatio: 'Payout ratio',
  revenueCagr: 'Revenue CAGR',
  profitCagr: 'Profit CAGR',
  freeCashFlowYield: 'FCF yield',
  earningsStability: 'Earnings stability',
  liquidityScore: 'Liquidity score',
  governanceScore: 'Governance score',
  sectorConcentration: 'Sector concentration',
  reinvestmentScore: 'Reinvestment score',
  vacancyRate: 'Vacancy rate',
  pvp: 'P/VP',
  ffoYield: 'FFO yield',
  capRate: 'Cap rate',
  tenantConcentration: 'Tenant concentration',
  assetQualityScore: 'Asset quality',
  managementQualityScore: 'Management quality',
  distributionStability: 'Distribution stability',
  leverage: 'Leverage',
  defaultRate: 'Default rate',
  contractDurationYears: 'Contract duration',
  leaseDiversificationScore: 'Lease diversification',
};

const percentIndicators = new Set([
  'roe',
  'roic',
  'netMargin',
  'dividendYield',
  'payoutRatio',
  'revenueCagr',
  'profitCagr',
  'freeCashFlowYield',
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
]);

export const formatScore = (score: number) => `${Math.round(score)}/100`;

export const formatShortScore = (score: number) => `${Math.round(score)}`;

export const getIndicatorLabel = (key: string) => indicatorLabels[key] ?? key;

export const formatIndicatorValue = (key: string, value: number) => {
  if (percentIndicators.has(key)) {
    return `${value.toFixed(1)}%`;
  }

  if (scoreIndicators.has(key)) {
    return formatScore(value);
  }

  if (multipleIndicators.has(key)) {
    return `${value.toFixed(1)}x`;
  }

  if (key === 'contractDurationYears') {
    return `${value.toFixed(1)} years`;
  }

  return value.toLocaleString('en-US', {
    maximumFractionDigits: 1,
  });
};

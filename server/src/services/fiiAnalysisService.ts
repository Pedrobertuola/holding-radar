import type { MacroIndicators } from '../providers/BancoCentralProvider';
import { fiiClassificationByTicker } from '../data/fiiClassification';
import type {
  FiiCreditRiskLevel,
  FiiDiversificationLevel,
  FiiKind,
  FiiProfile,
  ScoreBreakdown,
} from '../types';

type ApiRecord = Record<string, unknown>;

interface FiiRiskInput {
  priceToNav: number;
  dividendYield12m: number;
  totalInvestors: number;
  equity: number;
  segmentType?: string;
}

interface FiiProfileResult {
  profile: FiiProfile;
  positivePoints: string[];
  riskPoints: string[];
  valuationNotes: string[];
  dividendNotes: string[];
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const toStringValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : undefined;

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value.replace(',', '.'));
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  return undefined;
};

const findNumber = (record: ApiRecord, keys: string[]) => {
  for (const key of keys) {
    const value = toNumber(record[key]);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const formatPercentValue = (value: number) =>
  `${(value * 100).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })}%`;

const classifyFiiKind = (text: string): FiiKind => {
  const normalized = normalizeText(text);

  if (
    ['fundo de fundos', 'fundos de fundos', 'fof'].some((keyword) =>
      normalized.includes(keyword),
    )
  ) {
    return 'FOF';
  }

  if (normalized.includes('desenvolvimento')) {
    return 'DESENVOLVIMENTO';
  }

  if (
    ['hibrido', 'multiestrategia', 'multi estrategia', 'multisegmento'].some(
      (keyword) => normalized.includes(keyword),
    )
  ) {
    return 'HIBRIDO';
  }

  if (
    [
      'recebiveis',
      'recebivel',
      'cri',
      'credito',
      'papel',
      'hipotec',
      'renda fixa',
    ].some((keyword) => normalized.includes(keyword))
  ) {
    return 'PAPEL';
  }

  if (
    [
      'logistica',
      'galpoes',
      'shopping',
      'shoppings',
      'lajes',
      'escritorio',
      'escritorios',
      'renda urbana',
      'varejo',
      'educacional',
      'hospital',
      'agencia',
      'hoteis',
      'imoveis',
      'imovel',
    ].some((keyword) => normalized.includes(keyword))
  ) {
    return 'TIJOLO';
  }

  return 'NAO_IDENTIFICADO';
};

const getKindLabel = (kind: FiiKind) => {
  const labels: Record<FiiKind, string> = {
    PAPEL: 'Fundo de papel',
    TIJOLO: 'Fundo de tijolo',
    HIBRIDO: 'Fundo híbrido',
    FOF: 'Fundo de fundos',
    DESENVOLVIMENTO: 'Fundo de desenvolvimento',
    OUTRO: 'Outro tipo de FII',
    NAO_IDENTIFICADO: 'Tipo não identificado',
  };

  return labels[kind];
};

const getDiversification = (
  kind: FiiKind,
  rawIndicators: ApiRecord,
): {
  level: FiiDiversificationLevel;
  label: string;
  summary: string;
  brickRiskDrivers: string[];
} => {
  if (!['TIJOLO', 'HIBRIDO', 'DESENVOLVIMENTO'].includes(kind)) {
    return {
      level: 'nao_aplicavel',
      label: 'Não aplicável',
      summary:
        'Diversificação de imóveis não é o eixo principal para este tipo de FII.',
      brickRiskDrivers: [],
    };
  }

  const propertyCount = findNumber(rawIndicators, [
    'properties',
    'propertyCount',
    'numberOfProperties',
    'quantityProperties',
    'realEstateCount',
    'numberOfAssets',
  ]);
  const realEstateAssets = findNumber(rawIndicators, [
    'realEstateAssets',
    'Direitos_Bens_Imoveis',
  ]);
  const totalInvested = findNumber(rawIndicators, [
    'totalInvested',
    'Total_Investido',
  ]);
  const realEstateShare =
    realEstateAssets !== undefined && totalInvested !== undefined && totalInvested > 0
      ? realEstateAssets / totalInvested
      : undefined;

  if (propertyCount === undefined) {
    if (realEstateShare !== undefined) {
      return {
        level: 'nao_disponivel',
        label: 'Não disponível por imóvel',
        summary: `A CVM indica ${formatPercentValue(realEstateShare)} do total investido em imóveis/direitos reais, mas não trouxe quantidade de imóveis, praças ou inquilinos neste arquivo mensal.`,
        brickRiskDrivers: [
          'Diversificação por imóvel, região e inquilino precisa ser confirmada no relatório gerencial.',
        ],
      };
    }

    return {
      level: 'nao_disponivel',
      label: 'Não disponível',
      summary:
        'A fonte atual não trouxe quantidade de imóveis, praças ou inquilinos. A diversificação precisa ser confirmada em relatório gerencial.',
      brickRiskDrivers: [
        'Sem número de imóveis ou concentração por inquilino na fonte estruturada.',
      ],
    };
  }

  if (propertyCount >= 10) {
    return {
      level: 'alta',
      label: 'Alta',
      summary: `A fonte estruturada indica ${propertyCount} imóveis/ativos, sugerindo diversificação maior.`,
      brickRiskDrivers: [],
    };
  }

  if (propertyCount >= 5) {
    return {
      level: 'media',
      label: 'Média',
      summary: `A fonte estruturada indica ${propertyCount} imóveis/ativos, sugerindo diversificação intermediária.`,
      brickRiskDrivers: [
        'A diversificação existe, mas ainda pode haver concentração relevante por ativo ou região.',
      ],
    };
  }

  return {
    level: 'baixa',
    label: 'Baixa',
    summary: `A fonte estruturada indica ${propertyCount} imóveis/ativos, sugerindo concentração elevada.`,
    brickRiskDrivers: [
      'Poucos imóveis podem aumentar o impacto de vacância, inadimplência ou renegociação de um ativo específico.',
    ],
  };
};

const getCreditRisk = (
  kind: FiiKind,
  metrics: FiiRiskInput,
  scores: ScoreBreakdown,
  rawIndicators: ApiRecord,
): {
  level: FiiCreditRiskLevel;
  label: string;
  confidence: FiiProfile['creditRiskConfidence'];
  summary: string;
  paperRiskDrivers: string[];
} => {
  if (!['PAPEL', 'HIBRIDO', 'FOF'].includes(kind)) {
    return {
      level: 'nao_aplicavel',
      label: 'Não aplicável',
      confidence: 'nao_aplicavel',
      summary:
        'Risco de crédito de CRIs não é o eixo principal para este tipo de FII.',
      paperRiskDrivers: [],
    };
  }

  let riskScore = 0;
  const drivers: string[] = [];
  const criAssets = findNumber(rawIndicators, ['criAssets', 'CRI', 'CRI_CRA']);
  const totalInvested = findNumber(rawIndicators, [
    'totalInvested',
    'Total_Investido',
  ]);
  const criShare =
    criAssets !== undefined && totalInvested !== undefined && totalInvested > 0
      ? criAssets / totalInvested
      : undefined;

  if (criShare !== undefined) {
    drivers.push(
      `A CVM indica ${formatPercentValue(criShare)} do total investido em CRI/CRA.`,
    );

    if (criShare >= 0.75) {
      riskScore += 1;
      drivers.push(
        'Exposição alta a CRI/CRA torna a análise mais dependente de devedores, garantias, subordinação e indexadores.',
      );
    }
  }

  if (metrics.dividendYield12m >= 0.18) {
    riskScore += 3;
    drivers.push(
      'Dividend yield muito elevado pode sinalizar prêmio de risco, eventos não recorrentes ou distribuição menos sustentável.',
    );
  } else if (metrics.dividendYield12m >= 0.14) {
    riskScore += 2;
    drivers.push(
      'Dividend yield acima da média exige checar qualidade e recorrência dos CRIs.',
    );
  }

  if (metrics.priceToNav <= 0.72) {
    riskScore += 2;
    drivers.push(
      'P/VP muito descontado pode refletir percepção de risco de crédito ou liquidez.',
    );
  } else if (metrics.priceToNav <= 0.85) {
    riskScore += 1;
    drivers.push('P/VP descontado merece comparação com a qualidade da carteira.');
  }

  if (metrics.equity < 150_000_000) {
    riskScore += 2;
    drivers.push('Patrimônio líquido menor aumenta sensibilidade a eventos de carteira.');
  } else if (metrics.equity < 350_000_000) {
    riskScore += 1;
    drivers.push('Porte intermediário reduz a folga contra problemas específicos.');
  }

  if (metrics.totalInvestors < 15_000) {
    riskScore += 2;
    drivers.push('Base de investidores pequena pode pressionar liquidez e volatilidade.');
  } else if (metrics.totalInvestors < 40_000) {
    riskScore += 1;
    drivers.push('Base de investidores ainda não é ampla para padrões do radar.');
  }

  if (scores.risk < 48) {
    riskScore += 1;
    drivers.push('A própria nota de risco do scanner ficou pressionada.');
  }

  if (metrics.segmentType && normalizeText(metrics.segmentType).includes('high yield')) {
    riskScore += 2;
    drivers.push(
      'Segmento classificado como high yield exige cuidado adicional com devedores, garantias e concentração.',
    );
  }

  const level: FiiCreditRiskLevel =
    riskScore >= 5 ? 'alto' : riskScore >= 2 ? 'moderado' : 'baixo';
  const label =
    level === 'alto'
      ? 'Alto por proxies'
      : level === 'moderado'
        ? 'Moderado por proxies'
        : 'Baixo por proxies';
  const safeDrivers =
    drivers.length > 0
      ? drivers
      : [
          'Os proxies quantitativos não indicaram estresse relevante, mas a carteira de CRIs precisa ser conferida no relatório gerencial.',
        ];

  return {
    level,
    label,
    confidence: 'baixa',
    summary:
      'Risco de crédito estimado por proxies, porque a fonte estruturada não trouxe rating, devedores, garantias, subordinação ou concentração dos CRIs.',
    paperRiskDrivers: safeDrivers,
  };
};

const formatMacro = (macro?: MacroIndicators) => {
  if (!macro) {
    return undefined;
  }

  const parts = [
    macro.selic
      ? `Selic ${macro.selic.value.toFixed(4)} ${macro.selic.unit} em ${macro.selic.date}`
      : undefined,
    macro.cdi
      ? `CDI ${macro.cdi.value.toFixed(4)} ${macro.cdi.unit} em ${macro.cdi.date}`
      : undefined,
    macro.ipca
      ? `IPCA ${macro.ipca.value.toFixed(2)} ${macro.ipca.unit} em ${macro.ipca.date}`
      : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('; ') : undefined;
};

export const buildFiiProfile = (
  ticker: string,
  rawIndicators: ApiRecord,
  metrics: FiiRiskInput,
  scores: ScoreBreakdown,
  macro?: MacroIndicators,
): FiiProfileResult => {
  const classification = fiiClassificationByTicker[ticker.toUpperCase()];
  const segment =
    classification?.segment ??
    toStringValue(rawIndicators.segmentoAtuacao) ??
    toStringValue(rawIndicators.segmentType) ??
    metrics.segmentType ??
    'Segmento não informado';
  const name = toStringValue(rawIndicators.name) ?? ticker;
  const kind = classification?.kind ?? classifyFiiKind(`${segment} ${name}`);
  const diversification = getDiversification(kind, rawIndicators);
  const creditRisk = getCreditRisk(
    kind,
    { ...metrics, segmentType: segment },
    scores,
    rawIndicators,
  );
  const macroLine = formatMacro(macro);
  const dataSources = ['Brapi'];

  if (macroLine) {
    dataSources.push('Banco Central SGS');
  }

  if (toStringValue(rawIndicators.cvmReferenceDate)) {
    dataSources.push('CVM informe mensal');
  }

  if (classification) {
    dataSources.push('Curadoria de tipo de FII');
  }

  const profile: FiiProfile = {
    kind,
    typeLabel: getKindLabel(kind),
    segment,
    diversification: diversification.level,
    diversificationLabel: diversification.label,
    diversificationSummary: diversification.summary,
    creditRisk: creditRisk.level,
    creditRiskLabel: creditRisk.label,
    creditRiskConfidence: creditRisk.confidence,
    creditRiskSummary: creditRisk.summary,
    paperRiskDrivers: creditRisk.paperRiskDrivers,
    brickRiskDrivers: diversification.brickRiskDrivers,
    dataSources,
  };

  const positivePoints = [
    `Classificação setorial estimada: ${profile.typeLabel}.`,
    diversification.level === 'alta'
      ? 'Diversificação imobiliária aparece forte na fonte estruturada.'
      : undefined,
    creditRisk.level === 'baixo'
      ? 'Proxies de risco de crédito dos CRIs não indicam estresse relevante.'
      : undefined,
  ].filter((item): item is string => Boolean(item));

  const riskPoints = [
    profile.kind === 'NAO_IDENTIFICADO'
      ? 'Tipo de FII não identificado de forma segura pela fonte estruturada.'
      : undefined,
    ...profile.brickRiskDrivers,
    ...profile.paperRiskDrivers,
    macroLine && ['PAPEL', 'HIBRIDO', 'FOF'].includes(kind)
      ? `Contexto macro pelo Banco Central: ${macroLine}. Fundos de papel podem ser sensíveis a CDI, IPCA, spreads de crédito e marcação a mercado.`
      : undefined,
  ].filter((item): item is string => Boolean(item));

  const valuationNotes = [
    `Tipo do FII considerado no valuation: ${profile.typeLabel}.`,
    ['PAPEL', 'HIBRIDO', 'FOF'].includes(kind)
      ? 'Para fundos de papel, P/VP e dividend yield precisam ser lidos junto com qualidade dos CRIs, garantias, devedores e indexadores.'
      : undefined,
    ['TIJOLO', 'HIBRIDO', 'DESENVOLVIMENTO'].includes(kind)
      ? 'Para fundos de tijolo, valuation também depende de vacância, concentração de imóveis, qualidade dos contratos e localização.'
      : undefined,
  ].filter((item): item is string => Boolean(item));

  const dividendNotes = [
    ['PAPEL', 'HIBRIDO', 'FOF'].includes(kind)
      ? 'Em fundos de papel, rendimento alto pode refletir prêmio de risco, inflação passada, CDI elevado ou eventos não recorrentes.'
      : 'Em fundos de tijolo, rendimento deve ser comparado com ocupação, reajustes de aluguel, contratos e capex dos imóveis.',
  ];

  return {
    profile,
    positivePoints,
    riskPoints,
    valuationNotes,
    dividendNotes,
  };
};

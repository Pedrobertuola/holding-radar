import zlib from 'node:zlib';
import tls from 'node:tls';

import type {
  DividendData,
  FundamentalsData,
  MarketDataProvider,
  QuoteData,
} from './MarketDataProvider';
import type { AssetType } from '../types';

type CsvRow = Record<string, string>;

export interface CvmFiiMonthlyData {
  ticker: string;
  cnpj: string;
  name?: string;
  publicAudience?: string;
  referenceDate: string;
  segment?: string;
  quotasIssued?: number;
  totalInvestors?: number;
  totalAssets?: number;
  equity?: number;
  navPerShare?: number;
  monthlyDividendYield?: number;
  monthlyDividendPerShare?: number;
  dividendYield12m?: number;
  dividendPerShare12m?: number;
  realEstateAssets?: number;
  finishedRentalProperties?: number;
  constructionRentalProperties?: number;
  criAssets?: number;
  fiiAssets?: number;
  cashAndLiquidity?: number;
  totalInvested?: number;
  totalLiabilities?: number;
  source: 'cvm-inf-mensal-fii';
}

const CVM_MONTHLY_BASE_URL =
  'https://dados.cvm.gov.br/dados/FII/DOC/INF_MENSAL/DADOS';
const CVM_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let cachedMonthlyData:
  | {
      expiresAt: number;
      data: Map<string, CvmFiiMonthlyData>;
    }
  | null = null;
let certificatesConfigured = false;

const decoder = new TextDecoder('latin1');

const ensureSystemCertificates = () => {
  if (certificatesConfigured) {
    return;
  }

  certificatesConfigured = true;

  try {
    const defaultCertificates = tls.getCACertificates('default');
    const systemCertificates = tls.getCACertificates('system');

    if (systemCertificates.length > 0) {
      tls.setDefaultCACertificates([
        ...defaultCertificates,
        ...systemCertificates,
      ]);
    }
  } catch (error) {
    console.warn('Não foi possível carregar certificados do sistema:', error);
  }
};

const toNumber = (value: string | undefined) => {
  if (!value?.trim()) {
    return undefined;
  }

  const normalized = value.replace(',', '.');
  const numberValue = Number(normalized);

  return Number.isFinite(numberValue) ? numberValue : undefined;
};

const getTickerFromIsin = (isin: string | undefined) => {
  const fiiMatch = isin?.toUpperCase().match(/^BR([A-Z0-9]{4})CTF/);
  if (fiiMatch) {
    return `${fiiMatch[1]}11`;
  }

  const match = isin?.toUpperCase().match(/^BR([A-Z0-9]{6})/);
  return match?.[1];
};

const parseDate = (value: string | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : new Date(0);

const parseCsv = (content: string): CsvRow[] => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const [headerLine, ...dataLines] = lines;

  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split(';');

  return dataLines.map((line) => {
    const values = line.split(';');
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    return row;
  });
};

const readZipEntries = (buffer: Buffer) => {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);

    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = buffer.toString('utf8', nameStart, nameStart + fileNameLength);
    const compressedData = buffer.subarray(dataStart, dataEnd);

    if (!fileName.endsWith('/')) {
      const data =
        compressionMethod === 0
          ? compressedData
          : zlib.inflateRawSync(compressedData);
      entries.set(fileName, data);
    }

    offset = dataEnd;
  }

  return entries;
};

const buildKey = (cnpj: string, referenceDate: string) =>
  `${cnpj}|${referenceDate}`;

const pickLatestByTicker = (
  generalRows: CsvRow[],
  complementRows: CsvRow[],
  assetRows: CsvRow[],
) => {
  const complementByKey = new Map<string, CsvRow>();
  const assetByKey = new Map<string, CsvRow>();
  const yieldHistoryByCnpj = new Map<
    string,
    Array<{
      date: string;
      value: number;
      dividendPerShare?: number;
    }>
  >();

  complementRows.forEach((row) => {
    const cnpj = row.CNPJ_Fundo_Classe;
    const referenceDate = row.Data_Referencia;
    const key = buildKey(cnpj, referenceDate);
    complementByKey.set(key, row);

    const monthlyYield = toNumber(row.Percentual_Dividend_Yield_Mes);
    const navPerShare = toNumber(row.Valor_Patrimonial_Cotas);
    if (monthlyYield !== undefined) {
      const history = yieldHistoryByCnpj.get(cnpj) ?? [];
      history.push({
        date: referenceDate,
        value: monthlyYield,
        dividendPerShare:
          navPerShare !== undefined ? monthlyYield * navPerShare : undefined,
      });
      yieldHistoryByCnpj.set(cnpj, history);
    }
  });

  assetRows.forEach((row) => {
    assetByKey.set(buildKey(row.CNPJ_Fundo_Classe, row.Data_Referencia), row);
  });

  const candidates = new Map<string, CvmFiiMonthlyData>();

  generalRows.forEach((general) => {
    const ticker = getTickerFromIsin(general.Codigo_ISIN);
    const cnpj = general.CNPJ_Fundo_Classe;
    const referenceDate = general.Data_Referencia;

    if (!ticker || !cnpj || !referenceDate) {
      return;
    }

    const complement = complementByKey.get(buildKey(cnpj, referenceDate));
    const asset = assetByKey.get(buildKey(cnpj, referenceDate));

    if (!complement) {
      return;
    }

    const history = (yieldHistoryByCnpj.get(cnpj) ?? [])
      .filter((item) => parseDate(item.date) <= parseDate(referenceDate))
      .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())
      .slice(0, 12);
    const dividendYield12m =
      history.length >= 3
        ? history.reduce((sum, item) => sum + item.value, 0)
        : undefined;
    const dividendPerShare12m =
      history.length >= 3 &&
      history.every((item) => item.dividendPerShare !== undefined)
        ? history.reduce(
            (sum, item) => sum + (item.dividendPerShare ?? 0),
            0,
          )
        : undefined;
    const monthlyDividendYield = toNumber(complement.Percentual_Dividend_Yield_Mes);
    const navPerShare = toNumber(complement.Valor_Patrimonial_Cotas);

    const current = candidates.get(ticker);
    const currentDate = current ? parseDate(current.referenceDate) : undefined;
    const candidateDate = parseDate(referenceDate);
    const currentIsRetail =
      current?.publicAudience?.toUpperCase().includes('GERAL') ?? false;
    const candidateIsRetail = general.Publico_Alvo
      ?.toUpperCase()
      .includes('GERAL');

    if (
      current &&
      currentDate &&
      (currentDate > candidateDate ||
        (currentDate.getTime() === candidateDate.getTime() &&
          currentIsRetail &&
          !candidateIsRetail))
    ) {
      return;
    }

    candidates.set(ticker, {
      ticker,
      cnpj,
      referenceDate,
      name: general.Nome_Fundo_Classe,
      publicAudience: general.Publico_Alvo,
      segment: general.Segmento_Atuacao,
      quotasIssued:
        toNumber(complement.Cotas_Emitidas) ??
        toNumber(general.Quantidade_Cotas_Emitidas),
      totalInvestors: toNumber(complement.Total_Numero_Cotistas),
      totalAssets: toNumber(complement.Valor_Ativo),
      equity: toNumber(complement.Patrimonio_Liquido),
      navPerShare,
      monthlyDividendYield,
      monthlyDividendPerShare:
        monthlyDividendYield !== undefined && navPerShare !== undefined
          ? monthlyDividendYield * navPerShare
          : undefined,
      dividendYield12m,
      dividendPerShare12m,
      realEstateAssets: toNumber(asset?.Direitos_Bens_Imoveis),
      finishedRentalProperties: toNumber(asset?.Imoveis_Renda_Acabados),
      constructionRentalProperties: toNumber(asset?.Imoveis_Renda_Construcao),
      criAssets:
        (toNumber(asset?.CRI) ?? 0) + (toNumber(asset?.CRI_CRA) ?? 0) || undefined,
      fiiAssets: toNumber(asset?.FII),
      cashAndLiquidity: toNumber(asset?.Disponibilidades),
      totalInvested: toNumber(asset?.Total_Investido),
      totalLiabilities: toNumber(asset?.Total_Passivo),
      source: 'cvm-inf-mensal-fii',
    });
  });

  return candidates;
};

const loadMonthlyYear = async (year: number) => {
  ensureSystemCertificates();

  const response = await fetch(
    `${CVM_MONTHLY_BASE_URL}/inf_mensal_fii_${year}.zip`,
  );

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status} ao consultar informes CVM ${year}.`);
  }

  const entries = readZipEntries(Buffer.from(await response.arrayBuffer()));
  const findEntry = (part: string) =>
    [...entries.entries()].find(([name]) => name.includes(part))?.[1];

  return {
    generalRows: parseCsv(decoder.decode(findEntry('geral') ?? Buffer.alloc(0))),
    complementRows: parseCsv(
      decoder.decode(findEntry('complemento') ?? Buffer.alloc(0)),
    ),
    assetRows: parseCsv(
      decoder.decode(findEntry('ativo_passivo') ?? Buffer.alloc(0)),
    ),
  };
};

export class CvmProvider implements MarketDataProvider {
  name = 'cvm';

  async getQuotes(_tickers: string[]): Promise<QuoteData[]> {
    return [];
  }

  async getFundamentals(
    _ticker: string,
    _type: AssetType,
  ): Promise<FundamentalsData | null> {
    return null;
  }

  async getDividends(
    _ticker: string,
    _type: AssetType,
  ): Promise<DividendData[]> {
    return [];
  }

  async getFiiMonthlyData(tickers: readonly string[]) {
    const data = await this.getAllFiiMonthlyData();
    const result = new Map<string, CvmFiiMonthlyData>();

    tickers.forEach((ticker) => {
      const item = data.get(ticker.toUpperCase());
      if (item) {
        result.set(ticker.toUpperCase(), item);
      }
    });

    return result;
  }

  private async getAllFiiMonthlyData() {
    if (cachedMonthlyData && cachedMonthlyData.expiresAt > Date.now()) {
      return cachedMonthlyData.data;
    }

    const currentYear = new Date().getFullYear();
    const datasets = await Promise.all([
      loadMonthlyYear(currentYear - 1),
      loadMonthlyYear(currentYear),
    ]);
    const data = pickLatestByTicker(
      datasets.flatMap((dataset) => dataset.generalRows),
      datasets.flatMap((dataset) => dataset.complementRows),
      datasets.flatMap((dataset) => dataset.assetRows),
    );

    cachedMonthlyData = {
      data,
      expiresAt: Date.now() + CVM_CACHE_TTL_MS,
    };

    return data;
  }
}

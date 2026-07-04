import tls from 'node:tls';

export interface MacroIndicator {
  name: 'selic' | 'cdi' | 'ipca';
  value: number;
  unit: string;
  date: string;
  source: 'banco-central-sgs';
}

export interface MacroIndicators {
  source: 'banco-central-sgs';
  updatedAt: string;
  selic?: MacroIndicator;
  cdi?: MacroIndicator;
  ipca?: MacroIndicator;
}

type SgsResponse = Array<{
  data: string;
  valor: string;
}>;

let certificatesConfigured = false;

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

const parseNumber = (value: string) => {
  const numberValue = Number(value.replace(',', '.'));
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

export class BancoCentralProvider {
  name = 'banco-central-sgs' as const;

  async getLatestMacroIndicators(): Promise<MacroIndicators> {
    const [selic, cdi, ipca] = await Promise.all([
      this.getSgsIndicator('selic', 11, '% ao dia'),
      this.getSgsIndicator('cdi', 12, '% ao dia'),
      this.getSgsIndicator('ipca', 433, '% ao mês'),
    ]);

    return {
      source: this.name,
      updatedAt: new Date().toISOString(),
      selic,
      cdi,
      ipca,
    };
  }

  private async getSgsIndicator(
    name: MacroIndicator['name'],
    seriesId: number,
    unit: string,
  ): Promise<MacroIndicator | undefined> {
    ensureSystemCertificates();

    const response = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados/ultimos/1?formato=json`,
    );

    if (!response.ok) {
      throw new Error(
        `Erro HTTP ${response.status} ao consultar SGS ${seriesId}.`,
      );
    }

    const payload = (await response.json()) as SgsResponse;
    const latest = payload[0];
    const value = latest ? parseNumber(latest.valor) : undefined;

    if (!latest || value === undefined) {
      return undefined;
    }

    return {
      name,
      value,
      unit,
      date: latest.data,
      source: this.name,
    };
  }
}

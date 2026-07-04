import {
  AlertTriangle,
  Clock3,
  Database,
  Filter,
  LineChart,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AssetCard } from '../components/AssetCard';
import { Disclaimer } from '../components/Disclaimer';
import { getScanner, refreshScanner } from '../services/api';
import type { Asset, AssetType, InsufficientDataAsset, ScannerResult } from '../types';
import { formatShortScore } from '../utils/format';

type SortKey = 'score' | 'dividendYield' | 'valuation' | 'risk';
type TypeFilter = 'all' | AssetType;
type FocusFilter = 'all' | 'income' | 'growth';

interface AssetSectionProps {
  title: string;
  description: string;
  assets: Asset[];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function sortAssets(assets: Asset[], sortKey: SortKey) {
  const sorted = [...assets];

  if (sortKey === 'dividendYield') {
    return sorted.sort(
      (a, b) => (b.metrics.dividendYield ?? 0) - (a.metrics.dividendYield ?? 0),
    );
  }

  if (sortKey === 'valuation') {
    return sorted.sort((a, b) => b.scores.price - a.scores.price);
  }

  if (sortKey === 'risk') {
    return sorted.sort((a, b) => b.scores.risk - a.scores.risk);
  }

  return sorted.sort((a, b) => b.scores.final - a.scores.final);
}

function AssetSection({ title, description, assets }: AssetSectionProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {assets.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {assets.slice(0, 6).map((asset) => (
            <AssetCard key={`${title}-${asset.ticker}`} asset={asset} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Nenhum ativo passou por este recorte com os dados disponíveis.
        </div>
      )}
    </section>
  );
}

function InsufficientDataSection({
  assets,
  failedCount,
}: {
  assets: InsufficientDataAsset[];
  failedCount: number;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Dados insuficientes</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Ativos mantidos fora do ranking porque a Brapi não retornou campos
            mínimos para pontuação.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          {assets.length + failedCount} pendências
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Campos ausentes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {assets.slice(0, 40).map((asset) => (
                <tr key={asset.ticker}>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    {asset.ticker}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{asset.type}</td>
                  <td className="px-4 py-3 text-slate-600">{asset.reason}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {asset.missingFields.join(', ') || 'n/d'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function DashboardPage() {
  const [scanner, setScanner] = useState<ScannerResult | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [focusFilter, setFocusFilter] = useState<FocusFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getScanner()
      .then((result) => {
        if (isMounted) {
          setScanner(result);
          setError(null);
        }
      })
      .catch((requestError: Error) => {
        if (isMounted) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAssets = useMemo(() => {
    if (!scanner) {
      return [];
    }

    const filtered = scanner.assets.filter((asset) => {
      const matchesType = typeFilter === 'all' || asset.type === typeFilter;
      const matchesFocus =
        focusFilter === 'all' || asset.focusTags.includes(focusFilter);

      return matchesType && matchesFocus;
    });

    return sortAssets(filtered, sortKey);
  }, [focusFilter, scanner, sortKey, typeFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const result = await refreshScanner();
      setScanner(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível atualizar o scanner.',
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">
              <LineChart className="h-4 w-4" aria-hidden="true" />
              Scanner de mercado
            </div>
            <h1 className="mt-4 text-3xl font-bold text-slate-950 sm:text-4xl">
              Holding Radar
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              O app varre um universo amplo de ações brasileiras e FIIs, busca
              dados reais na Brapi, remove ativos incompletos e ranqueia as
              melhores oportunidades educacionais do momento.
            </p>
          </div>
          <Disclaimer />
        </header>

        {scanner ? (
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                <Database className="h-4 w-4" aria-hidden="true" />
                Universo
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {scanner.universe.total}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-medium text-slate-500">
                Analisados
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {scanner.analyzedCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-medium text-slate-500">
                Melhor pontuação
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-950">
                {scanner.assets[0]
                  ? `${scanner.assets[0].ticker} ${formatShortScore(
                      scanner.assets[0].scores.final,
                    )}`
                  : 'n/d'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                Última atualização
              </div>
              <div className="mt-2 text-base font-bold text-slate-950">
                {formatDateTime(scanner.lastUpdated)}
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filtros e ordenação
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Explore os ativos válidos sem refazer chamadas à Brapi no
                navegador.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Atualizar scanner
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Ordenar por
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="score">Pontuação</option>
                <option value="dividendYield">Dividend yield</option>
                <option value="valuation">Valuation</option>
                <option value="risk">Risco menor</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tipo
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="all">Todos</option>
                <option value="STOCK">Ações</option>
                <option value="FII">FIIs</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Foco
              <select
                value={focusFilter}
                onChange={(event) =>
                  setFocusFilter(event.target.value as FocusFilter)
                }
                className="min-h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="all">Todos</option>
                <option value="income">Renda</option>
                <option value="growth">Crescimento</option>
              </select>
            </label>
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : null}

        {error ? (
          <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {scanner ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-950">
                    Status dos dados
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Resultado parcial: alguns ativos podem ter sido analisados
                    com dados em cache ou ficado indisponíveis por limite,
                    plano da API ou ausência de campos.
                  </p>
                </div>
                <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {scanner.dataMode === 'brapi-amplo'
                    ? 'Brapi amplo'
                    : 'Brapi limitado'}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">
                    Dados frescos
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-950">
                    {scanner.successfulFreshFetches}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">
                    Dados em cache
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-950">
                    {scanner.usedCachedData}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">
                    Dados defasados
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-950">
                    {scanner.staleAssets}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-medium text-slate-500">
                    Tickers com falha
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-950">
                    {scanner.failedTickers.length}
                  </div>
                </div>
              </div>

              {scanner.warnings.length > 0 ? (
                <div className="mt-4 space-y-2 text-sm text-amber-900">
                  {scanner.warnings.map((warning) => (
                    <div
                      key={warning}
                      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <AssetSection
              title="Top oportunidades hoje"
              description="Melhores combinações de qualidade, valuation, renda, crescimento e risco."
              assets={scanner.bestOverall}
            />
            <AssetSection
              title="Melhores ações"
              description="Ações com melhor pontuação composta entre fundamentos, preço e risco."
              assets={scanner.bestStocks}
            />
            <AssetSection
              title="Melhores FIIs"
              description="FIIs com renda, P/VP e risco em melhor equilíbrio."
              assets={scanner.bestFiis}
            />
            <AssetSection
              title="Foco em renda"
              description="Ativos com boa renda sem depender apenas do dividend yield."
              assets={scanner.bestIncome}
            />
            <AssetSection
              title="Foco em crescimento"
              description="Ações em que crescimento e qualidade pesam positivamente no score."
              assets={scanner.bestGrowth}
            />
            <AssetSection
              title="Excelentes, mas caras"
              description="Ativos de qualidade que ficaram penalizados pelo valuation."
              assets={scanner.excellentButExpensive}
            />
            <AssetSection
              title="Baratas, mas arriscadas"
              description="Ativos com preço chamativo, mas fundamentos ou risco mais frágeis."
              assets={scanner.cheapButRisky}
            />

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-slate-500" aria-hidden="true" />
                <h2 className="text-lg font-bold text-slate-950">
                  Explorar ativos analisados
                </h2>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredAssets.slice(0, 12).map((asset) => (
                  <AssetCard key={`explorar-${asset.ticker}`} asset={asset} />
                ))}
              </div>
            </section>

            <InsufficientDataSection
              assets={scanner.insufficientData}
              failedCount={scanner.failedTickers.length}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

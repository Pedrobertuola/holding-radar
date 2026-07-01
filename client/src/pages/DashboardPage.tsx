import { Filter, LineChart, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AssetCard } from '../components/AssetCard';
import { Disclaimer } from '../components/Disclaimer';
import { getAssets } from '../services/api';
import type { Asset } from '../types';
import { formatShortScore } from '../utils/format';

const filterOptions = [
  { key: 'all', label: 'All assets' },
  { key: 'stocks', label: 'Only stocks' },
  { key: 'fiis', label: 'Only FIIs' },
  { key: 'income', label: 'Income focus' },
  { key: 'growth', label: 'Growth focus' },
  { key: 'balanced', label: 'Balanced' },
] as const;

type FilterKey = (typeof filterOptions)[number]['key'];

const applyAssetFilter = (assets: Asset[], filter: FilterKey) => {
  switch (filter) {
    case 'stocks':
      return assets.filter((asset) => asset.type === 'STOCK');
    case 'fiis':
      return assets.filter((asset) => asset.type === 'FII');
    case 'income':
      return assets.filter((asset) => asset.focusTags.includes('income'));
    case 'growth':
      return assets.filter((asset) => asset.focusTags.includes('growth'));
    case 'balanced':
      return assets.filter((asset) => asset.focusTags.includes('balanced'));
    default:
      return assets;
  }
};

export function DashboardPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAssets()
      .then((loadedAssets) => {
        if (isMounted) {
          setAssets(loadedAssets);
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

  const filteredAssets = useMemo(
    () => applyAssetFilter(assets, activeFilter),
    [assets, activeFilter],
  );

  const averageScore = useMemo(() => {
    if (assets.length === 0) {
      return 0;
    }

    return (
      assets.reduce((sum, asset) => sum + asset.scores.final, 0) /
      assets.length
    );
  }, [assets]);

  const stockCount = assets.filter((asset) => asset.type === 'STOCK').length;
  const fiiCount = assets.filter((asset) => asset.type === 'FII').length;
  const topAsset = assets[0];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm">
              <LineChart className="h-4 w-4" aria-hidden="true" />
              Fundamental radar
            </div>
            <h1 className="mt-4 text-3xl font-bold text-slate-950 sm:text-4xl">
              Holding Radar
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Ranked Brazilian stocks and FIIs based on objective quality,
              price, income, growth, and risk filters.
            </p>
          </div>
          <Disclaimer />
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-500">Assets</div>
            <div className="mt-2 text-2xl font-bold text-slate-950">
              {assets.length}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-500">
              Average score
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-950">
              {formatShortScore(averageScore)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-500">
              Stocks / FIIs
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-950">
              {stockCount} / {fiiCount}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-slate-500">
              Current leader
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-950">
              {topAsset?.ticker ?? '--'}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filters
          </div>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => {
              const count = applyAssetFilter(assets, option.key).length;
              const isActive = activeFilter === option.key;

              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveFilter(option.key)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${
                    isActive
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      isActive
                        ? 'bg-white/15 text-white'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {!isLoading && !error ? (
          <section className="grid gap-4">
            {filteredAssets.map((asset) => (
              <AssetCard key={asset.ticker} asset={asset} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}

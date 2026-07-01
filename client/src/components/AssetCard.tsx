import { ArrowUpRight, Building2, Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { Asset } from '../types';
import { formatShortScore } from '../utils/format';
import { ScoreBar } from './ScoreBar';
import { StatusBadge } from './StatusBadge';

interface AssetCardProps {
  asset: Asset;
}

export function AssetCard({ asset }: AssetCardProps) {
  const typeIcon =
    asset.type === 'STOCK' ? (
      <Building2 className="h-4 w-4" aria-hidden="true" />
    ) : (
      <Landmark className="h-4 w-4" aria-hidden="true" />
    );

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700">
              {typeIcon}
              {asset.type}
            </span>
            <StatusBadge status={asset.statusLabel} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-950">
                #{asset.rank} {asset.ticker}
              </span>
              <span className="text-sm text-slate-500">{asset.segment}</span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-slate-800">
              {asset.name}
            </h2>
          </div>
        </div>

        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-950">
              {formatShortScore(asset.scores.final)}
            </div>
            <div className="text-xs font-medium text-slate-500">score</div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{asset.summary}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ScoreBar label="Quality" value={asset.scores.quality} />
        <ScoreBar label="Price" value={asset.scores.price} />
        <ScoreBar label="Income" value={asset.scores.income} />
        {asset.scores.growth !== undefined ? (
          <ScoreBar label="Growth" value={asset.scores.growth} />
        ) : null}
        <ScoreBar label="Risk" value={asset.scores.risk} />
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-xs font-medium text-slate-500">
          {asset.sector}
        </span>
        <Link
          to={`/assets/${asset.ticker}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
        >
          Details
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

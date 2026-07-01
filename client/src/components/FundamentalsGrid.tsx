import {
  formatIndicatorValue,
  getIndicatorLabel,
} from '../utils/format';

interface FundamentalsGridProps {
  indicators: Record<string, number>;
}

export function FundamentalsGrid({ indicators }: FundamentalsGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Object.entries(indicators).map(([key, value]) => (
        <div
          key={key}
          className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3"
        >
          <div className="text-xs font-medium text-slate-500">
            {getIndicatorLabel(key)}
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-950">
            {formatIndicatorValue(key, value)}
          </div>
        </div>
      ))}
    </div>
  );
}

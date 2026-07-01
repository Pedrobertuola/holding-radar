import { formatShortScore } from '../utils/format';

interface ScoreBarProps {
  label: string;
  value: number;
}

export function ScoreBar({ label, value }: ScoreBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">{formatShortScore(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-900"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

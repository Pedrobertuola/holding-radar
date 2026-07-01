import type { AssetStatus } from '../types';

const statusClassNames: Record<AssetStatus, string> = {
  'Oportunidade interessante':
    'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Atrativo com cautela': 'border-amber-200 bg-amber-50 text-amber-800',
  'Excelente, mas caro': 'border-sky-200 bg-sky-50 text-sky-800',
  'Barato, mas arriscado': 'border-rose-200 bg-rose-50 text-rose-800',
  'Fora dos filtros': 'border-slate-200 bg-slate-100 text-slate-700',
};

interface StatusBadgeProps {
  status: AssetStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClassNames[status]}`}
    >
      {status}
    </span>
  );
}

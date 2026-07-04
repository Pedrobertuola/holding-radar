import { ShieldAlert } from 'lucide-react';

export function Disclaimer() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <p>
          Este app tem fins exclusivamente educacionais e não fornece
          recomendações personalizadas de investimento. Os indicadores vêm da
          Brapi e podem ter atraso, limitações de cobertura ou campos ausentes.
        </p>
      </div>
    </div>
  );
}

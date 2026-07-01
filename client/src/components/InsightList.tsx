import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface InsightListProps {
  title: string;
  items: string[];
  tone: 'positive' | 'risk';
}

export function InsightList({ title, items, tone }: InsightListProps) {
  const Icon = tone === 'positive' ? CheckCircle2 : AlertTriangle;
  const iconClassName =
    tone === 'positive' ? 'text-emerald-600' : 'text-amber-600';

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${iconClassName}`}
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

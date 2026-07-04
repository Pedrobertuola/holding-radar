import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ScoreBreakdown } from '../types';

interface ScoreBreakdownChartProps {
  scores: ScoreBreakdown;
}

export function ScoreBreakdownChart({ scores }: ScoreBreakdownChartProps) {
  const data = [
    { label: 'Qualidade', value: scores.quality },
    { label: 'Preço', value: scores.price },
    { label: 'Renda', value: scores.income },
    ...(scores.growth !== undefined
      ? [{ label: 'Crescimento', value: scores.growth }]
      : []),
    { label: 'Risco', value: scores.risk },
    { label: 'Final', value: scores.final },
  ];

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 12, right: 18 }}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" domain={[0, 100]} tickLine={false} />
          <YAxis
            dataKey="label"
            type="category"
            tickLine={false}
            axisLine={false}
            width={96}
          />
          <Tooltip
            cursor={{ fill: '#f8fafc' }}
            formatter={(value) => {
              const numericValue =
                typeof value === 'number' ? value : Number(value ?? 0);

              return [`${Math.round(numericValue)}/100`, 'Pontuação'];
            }}
          />
          <Bar dataKey="value" fill="#0f172a" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

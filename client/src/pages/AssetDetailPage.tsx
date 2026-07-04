import { ArrowLeft, Bot, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Disclaimer } from '../components/Disclaimer';
import { FundamentalsGrid } from '../components/FundamentalsGrid';
import { InsightList } from '../components/InsightList';
import { ScoreBreakdownChart } from '../components/ScoreBreakdownChart';
import { ScoreBar } from '../components/ScoreBar';
import { StatusBadge } from '../components/StatusBadge';
import {
  generateAiAnalysis,
  getAsset,
} from '../services/api';
import type { AiAnalysisResponse, Asset } from '../types';
import { formatScore, formatShortScore } from '../utils/format';

interface NotesPanelProps {
  title: string;
  notes: string[];
}

function NotesPanel({ title, notes }: NotesPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <ul className="mt-4 space-y-3">
        {notes.map((note) => (
          <li key={note} className="text-sm leading-6 text-slate-700">
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FiiProfilePanel({ asset }: { asset: Asset }) {
  if (!asset.fiiProfile) {
    return null;
  }

  const profile = asset.fiiProfile;
  const items = [
    {
      label: 'Tipo de fundo',
      value: profile.typeLabel,
      description: profile.segment,
    },
    {
      label: 'Diversificação',
      value: profile.diversificationLabel,
      description: profile.diversificationSummary,
    },
    {
      label: 'Risco de CRIs',
      value: profile.creditRiskLabel,
      description: profile.creditRiskSummary,
    },
    {
      label: 'Fontes',
      value: profile.dataSources.join(', '),
      description:
        profile.creditRiskConfidence === 'baixa'
          ? 'Estimativa com baixa confiança quando a carteira detalhada não está disponível.'
          : 'Leitura baseada nos dados estruturados disponíveis.',
    },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">
        Perfil do fundo imobiliário
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-md border border-slate-200 bg-slate-50 p-4"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {item.label}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-950">
              {item.value}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {item.description}
            </p>
          </div>
        ))}
      </div>
      {profile.paperRiskDrivers.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-950">
            Pontos para fundos de papel
          </div>
          <ul className="mt-2 space-y-2">
            {profile.paperRiskDrivers.map((driver) => (
              <li key={driver} className="text-sm leading-6 text-amber-900">
                {driver}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {profile.brickRiskDrivers.length > 0 ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-950">
            Pontos para fundos de tijolo
          </div>
          <ul className="mt-2 space-y-2">
            {profile.brickRiskDrivers.map((driver) => (
              <li key={driver} className="text-sm leading-6 text-slate-700">
                {driver}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function AssetDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!ticker) {
      return () => {
        isMounted = false;
      };
    }

    getAsset(ticker)
      .then((loadedAsset) => {
        if (isMounted) {
          setAsset(loadedAsset);
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
  }, [ticker]);

  const handleGenerateAnalysis = async () => {
    if (!asset) {
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      const result = await generateAiAnalysis(asset);
      setAnalysis(result);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível gerar a análise.';

      setAnalysis({
        source: 'fallback',
        analysis: `A análise educacional local não pôde ser carregada pela API. ${message}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const visibleError = error ?? (!ticker ? 'Ticker não informado.' : null);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao radar
          </Link>
          <Disclaimer />
        </div>

        {isLoading && !visibleError ? (
          <div className="flex min-h-96 items-center justify-center rounded-lg border border-slate-200 bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : null}

        {visibleError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {visibleError}
          </div>
        ) : null}

        {asset ? (
          <>
            <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      {asset.type}
                    </span>
                    <StatusBadge status={asset.statusLabel} />
                  </div>
                  <h1 className="mt-4 text-3xl font-bold text-slate-950 sm:text-4xl">
                    {asset.ticker}
                  </h1>
                  <p className="mt-2 text-lg font-semibold text-slate-800">
                    {asset.name}
                  </p>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                    {asset.summary}
                  </p>
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    Fontes: {asset.fiiProfile
                      ? asset.fiiProfile.dataSources.join(', ')
                      : 'Brapi'}
                    . Atualizado em{' '}
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(asset.lastUpdated))}
                  </p>
                </div>

                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-950">
                      {formatShortScore(asset.scores.final)}
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      pontuação final
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">
                  Composição da pontuação
                </h2>
                <ScoreBreakdownChart scores={asset.scores} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">
                  Detalhes da pontuação
                </h2>
                <div className="mt-5 space-y-4">
                  <ScoreBar label="Qualidade" value={asset.scores.quality} />
                  <ScoreBar label="Preço" value={asset.scores.price} />
                  <ScoreBar label="Renda" value={asset.scores.income} />
                  {asset.scores.growth !== undefined ? (
                    <ScoreBar label="Crescimento" value={asset.scores.growth} />
                  ) : null}
                  <ScoreBar label="Risco" value={asset.scores.risk} />
                </div>
                <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-500">
                    Pontuação final
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-950">
                    {formatScore(asset.scores.final)}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">
                Indicadores fundamentalistas
              </h2>
              <div className="mt-4">
                <FundamentalsGrid indicators={asset.indicators} />
              </div>
            </section>

            <FiiProfilePanel asset={asset} />

            <section className="grid gap-4 lg:grid-cols-2">
              <InsightList
                title="Pontos positivos"
                items={asset.positivePoints}
                tone="positive"
              />
              <InsightList
                title="Pontos de risco"
                items={asset.riskPoints}
                tone="risk"
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <NotesPanel title="Notas de valuation" notes={asset.valuationNotes} />
              <NotesPanel title="Notas de dividendos" notes={asset.dividendNotes} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
                    <Bot className="h-5 w-5" aria-hidden="true" />
                    Análise educacional com IA
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Disponível apenas para ativos com dados reais suficientes e
                    pontuação válida no scanner.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAnalysis}
                  disabled={isAnalyzing || asset.dataQuality !== 'valid'}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  Gerar análise com IA
                </button>
              </div>

              {analysis ? (
                <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {analysis.source === 'openai'
                      ? 'Análise da OpenAI'
                      : analysis.source === 'cache'
                        ? 'Análise em cache'
                        : 'Análise local'}
                  </div>
                  <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
                    {analysis.analysis}
                  </p>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

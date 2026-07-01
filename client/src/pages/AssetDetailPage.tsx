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
          : 'Unable to generate analysis.';

      setAnalysis({
        source: 'fallback',
        analysis: `Local educational analysis could not be loaded from the API. ${message}`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const visibleError = error ?? (!ticker ? 'Ticker was not provided.' : null);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to radar
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
                </div>

                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-slate-950">
                      {formatShortScore(asset.scores.final)}
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      final score
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">
                  Score breakdown
                </h2>
                <ScoreBreakdownChart scores={asset.scores} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-950">
                  Score details
                </h2>
                <div className="mt-5 space-y-4">
                  <ScoreBar label="Quality" value={asset.scores.quality} />
                  <ScoreBar label="Price" value={asset.scores.price} />
                  <ScoreBar label="Income" value={asset.scores.income} />
                  {asset.scores.growth !== undefined ? (
                    <ScoreBar label="Growth" value={asset.scores.growth} />
                  ) : null}
                  <ScoreBar label="Risk" value={asset.scores.risk} />
                </div>
                <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-500">
                    Final score
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-950">
                    {formatScore(asset.scores.final)}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">
                Fundamental indicators
              </h2>
              <div className="mt-4">
                <FundamentalsGrid indicators={asset.indicators} />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <InsightList
                title="Positive points"
                items={asset.positivePoints}
                tone="positive"
              />
              <InsightList
                title="Risk points"
                items={asset.riskPoints}
                tone="risk"
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <NotesPanel title="Valuation notes" notes={asset.valuationNotes} />
              <NotesPanel title="Dividend notes" notes={asset.dividendNotes} />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
                    <Bot className="h-5 w-5" aria-hidden="true" />
                    AI educational analysis
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAnalysis}
                  disabled={isAnalyzing}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  Generate AI analysis
                </button>
              </div>

              {analysis ? (
                <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                    {analysis.source === 'openai'
                      ? 'OpenAI analysis'
                      : 'Local fallback analysis'}
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

import { Router } from 'express';

import {
  generateEducationalAnalysis,
  generateScannerInsight,
} from '../services/aiAnalysis';
import { findScoredAsset, getMarketScan } from '../services/marketScannerService';

export const aiRouter = Router();

const resolveTicker = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = payload as { ticker?: unknown; asset?: { ticker?: unknown } };
  const ticker =
    typeof candidate.ticker === 'string'
      ? candidate.ticker
      : typeof candidate.asset?.ticker === 'string'
        ? candidate.asset.ticker
        : undefined;

  return ticker?.toUpperCase();
};

aiRouter.post('/analyze', async (request, response) => {
  const ticker = resolveTicker(request.body);

  if (!ticker) {
    response.status(400).json({
      message:
        'Envie um ticker ou um ativo já pontuado pelo scanner para gerar a análise educacional.',
    });
    return;
  }

  const asset = await findScoredAsset(ticker);

  if (!asset) {
    response.status(422).json({
      message:
        'A análise com IA só está disponível para ativos com dados reais suficientes e pontuação válida.',
    });
    return;
  }

  const result = await generateEducationalAnalysis(asset);
  response.json(result);
});

const booleanFromBody = (body: unknown, key: string, fallback = false) => {
  if (!body || typeof body !== 'object') {
    return fallback;
  }

  const value = (body as Record<string, unknown>)[key];

  return typeof value === 'boolean' ? value : fallback;
};

aiRouter.post('/scanner-insight', async (request, response) => {
  try {
    const scan = await getMarketScan();
    const result = await generateScannerInsight(scan, {
      forceRefresh: booleanFromBody(request.body, 'force', false),
      includeNews: booleanFromBody(request.body, 'includeNews', true),
    });
    response.json(result);
  } catch (error) {
    console.error('Falha ao gerar leitura inteligente do scanner:', error);
    response.status(503).json({
      message:
        'Não foi possível gerar a leitura inteligente do radar neste momento.',
      detail:
        process.env.NODE_ENV === 'production'
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
    });
  }
});

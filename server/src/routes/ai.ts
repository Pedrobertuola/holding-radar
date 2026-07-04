import { Router } from 'express';

import { generateEducationalAnalysis } from '../services/aiAnalysis';
import { findScoredAsset } from '../services/marketScannerService';

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

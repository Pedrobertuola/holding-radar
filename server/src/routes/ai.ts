import { Router } from 'express';

import { assets } from '../data/assets';
import { generateEducationalAnalysis } from '../services/aiAnalysis';
import type { Asset } from '../types';

export const aiRouter = Router();

const resolveAsset = (payload: unknown): Asset | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = payload as Partial<Asset>;

  if (!candidate.ticker || typeof candidate.ticker !== 'string') {
    return undefined;
  }

  const canonicalAsset = assets.find(
    (asset) => asset.ticker === candidate.ticker?.toUpperCase(),
  );

  return canonicalAsset ?? (candidate as Asset);
};

aiRouter.post('/analyze', async (request, response) => {
  const asset = resolveAsset(request.body.asset ?? request.body);

  if (!asset) {
    response.status(400).json({
      message:
        'Send an asset object with at least a ticker to generate an educational analysis.',
    });
    return;
  }

  const result = await generateEducationalAnalysis(asset);
  response.json(result);
});

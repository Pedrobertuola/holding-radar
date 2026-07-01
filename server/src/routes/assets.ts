import { Router } from 'express';

import { assets } from '../data/assets';

export const assetsRouter = Router();

assetsRouter.get('/', (_request, response) => {
  response.json({ assets });
});

assetsRouter.get('/:ticker', (request, response) => {
  const ticker = request.params.ticker.toUpperCase();
  const asset = assets.find((item) => item.ticker === ticker);

  if (!asset) {
    response.status(404).json({
      message: `Asset ${ticker} was not found in the mocked dataset.`,
    });
    return;
  }

  response.json({ asset });
});

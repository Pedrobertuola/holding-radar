import { Router } from 'express';

import { getMarketScan } from '../services/marketScannerService';

export const assetsRouter = Router();

assetsRouter.get('/', async (_request, response) => {
  const scan = await getMarketScan();
  response.json({
    lastUpdated: scan.lastUpdated,
    assets: scan.assets,
  });
});

assetsRouter.get('/:ticker', async (request, response) => {
  const ticker = request.params.ticker.toUpperCase();
  const scan = await getMarketScan();
  const asset = scan.assets.find((item) => item.ticker === ticker);

  if (asset) {
    response.json({ asset, lastUpdated: scan.lastUpdated });
    return;
  }

  const insufficientAsset = scan.insufficientData.find(
    (item) => item.ticker === ticker,
  );

  if (insufficientAsset) {
    response.status(422).json({
      message:
        'Este ativo existe no universo, mas a Brapi não retornou dados suficientes para pontuação.',
      asset: insufficientAsset,
    });
    return;
  }

  response.status(404).json({
    message: `O ativo ${ticker} não foi encontrado no resultado do scanner.`,
  });
});

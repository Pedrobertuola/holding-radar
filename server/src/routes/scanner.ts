import { Router } from 'express';

import { getMarketScan } from '../services/marketScannerService';

export const scannerRouter = Router();

const parseLimit = (value: unknown, fallback = 10) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), 50);
};

scannerRouter.get('/', async (_request, response) => {
  const scan = await getMarketScan();
  response.json(scan);
});

scannerRouter.get('/top', async (request, response) => {
  const scan = await getMarketScan();
  const limit = parseLimit(request.query.limit);

  response.json({
    lastUpdated: scan.lastUpdated,
    assets: scan.bestOverall.slice(0, limit),
    failedTickers: scan.failedTickers,
  });
});

scannerRouter.get('/stocks', async (_request, response) => {
  const scan = await getMarketScan();
  response.json({
    lastUpdated: scan.lastUpdated,
    assets: scan.bestStocks,
  });
});

scannerRouter.get('/fiis', async (_request, response) => {
  const scan = await getMarketScan();
  response.json({
    lastUpdated: scan.lastUpdated,
    assets: scan.bestFiis,
  });
});

scannerRouter.get('/income', async (_request, response) => {
  const scan = await getMarketScan();
  response.json({
    lastUpdated: scan.lastUpdated,
    assets: scan.bestIncome,
  });
});

scannerRouter.get('/growth', async (_request, response) => {
  const scan = await getMarketScan();
  response.json({
    lastUpdated: scan.lastUpdated,
    assets: scan.bestGrowth,
  });
});

scannerRouter.get('/insufficient-data', async (_request, response) => {
  const scan = await getMarketScan();
  response.json({
    lastUpdated: scan.lastUpdated,
    assets: scan.insufficientData,
    failedTickers: scan.failedTickers,
  });
});

scannerRouter.post('/refresh', async (_request, response) => {
  const scan = await getMarketScan(true);
  response.json(scan);
});

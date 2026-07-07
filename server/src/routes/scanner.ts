import { Router, type Response } from 'express';

import { getMarketScan } from '../services/marketScannerService';

export const scannerRouter = Router();

const parseLimit = (value: unknown, fallback = 10) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), 50);
};

const handleScannerRequest = async <T>(
  response: Response,
  handler: () => Promise<T>,
) => {
  try {
    response.json(await handler());
  } catch (error) {
    console.error('Falha ao executar scanner:', error);
    response.status(503).json({
      message:
        'Scanner temporariamente indisponível. Verifique as variáveis DATABASE_URL, BRAPI_TOKEN e as migrations do banco no Render.',
      detail:
        process.env.NODE_ENV === 'production'
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
    });
  }
};

scannerRouter.get('/', async (_request, response) => {
  await handleScannerRequest(response, () => getMarketScan());
});

scannerRouter.get('/top', async (request, response) => {
  await handleScannerRequest(response, async () => {
    const scan = await getMarketScan();
    const limit = parseLimit(request.query.limit);

    return {
      lastUpdated: scan.lastUpdated,
      assets: scan.bestOverall.slice(0, limit),
      failedTickers: scan.failedTickers,
    };
  });
});

scannerRouter.get('/stocks', async (_request, response) => {
  await handleScannerRequest(response, async () => {
    const scan = await getMarketScan();
    return {
      lastUpdated: scan.lastUpdated,
      assets: scan.bestStocks,
    };
  });
});

scannerRouter.get('/fiis', async (_request, response) => {
  await handleScannerRequest(response, async () => {
    const scan = await getMarketScan();
    return {
      lastUpdated: scan.lastUpdated,
      assets: scan.bestFiis,
    };
  });
});

scannerRouter.get('/income', async (_request, response) => {
  await handleScannerRequest(response, async () => {
    const scan = await getMarketScan();
    return {
      lastUpdated: scan.lastUpdated,
      assets: scan.bestIncome,
    };
  });
});

scannerRouter.get('/growth', async (_request, response) => {
  await handleScannerRequest(response, async () => {
    const scan = await getMarketScan();
    return {
      lastUpdated: scan.lastUpdated,
      assets: scan.bestGrowth,
    };
  });
});

scannerRouter.get('/insufficient-data', async (_request, response) => {
  await handleScannerRequest(response, async () => {
    const scan = await getMarketScan();
    return {
      lastUpdated: scan.lastUpdated,
      assets: scan.insufficientData,
      failedTickers: scan.failedTickers,
    };
  });
});

scannerRouter.post('/refresh', async (_request, response) => {
  try {
    const currentScan = await getMarketScan();

    void getMarketScan(true).catch((error) => {
      console.error('Falha na atualização em segundo plano do scanner:', error);
    });

    response.status(202).json({
      ...currentScan,
      warnings: [
        ...currentScan.warnings,
        'Atualização iniciada em segundo plano. Aguarde alguns minutos e recarregue o scanner.',
      ],
    });
  } catch (error) {
    console.error('Falha ao iniciar atualização do scanner:', error);
    response.status(503).json({
      message:
        'Não foi possível iniciar a atualização do scanner. Verifique DATABASE_URL, BRAPI_TOKEN e os logs do Render.',
      detail:
        process.env.NODE_ENV === 'production'
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
    });
  }
});

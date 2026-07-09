import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';

import { aiRouter } from './routes/ai';
import { assetsRouter } from './routes/assets';
import { scannerRouter } from './routes/scanner';

export const app = express();

const localhostOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const normalizeConfiguredOrigin = (origin: string) => {
  const trimmed = origin.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
    return `http://${trimmed}`;
  }

  return `https://${trimmed}`;
};

const configuredOrigins = (process.env.CORS_ORIGIN ?? process.env.CLIENT_ORIGIN)
  ?.split(',')
  .map(normalizeConfiguredOrigin)
  .filter((origin): origin is string => Boolean(origin));

const isProduction = process.env.NODE_ENV === 'production';
const defaultProductionOrigins = [
  'https://*.vercel.app',
  'https://holding-radar*.vercel.app',
  'https://holding-radar-client*.vercel.app',
];
const allowedOrigins =
  configuredOrigins && configuredOrigins.length > 0
    ? new Set([...configuredOrigins, ...defaultProductionOrigins])
    : isProduction
      ? new Set(defaultProductionOrigins)
      : localhostOrigins;

const isOriginAllowed = (origin: string) => {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  return [...allowedOrigins].some((allowedOrigin) => {
    if (!allowedOrigin.includes('*')) {
      return false;
    }

    const pattern = `^${allowedOrigin
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`;

    return new RegExp(pattern).test(origin);
  });
};

app.use(
  cors({
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
    origin(origin, callback) {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origem não permitida pelo CORS.'));
    },
  }),
);
app.use(express.json({ limit: '1mb' }));

const apiInfo = {
  app: 'API do Holding Radar',
  status: 'ok',
  message: 'Backend ativo. Use as rotas /api/health, /api/scanner e /api/assets.',
  endpoints: {
    health: '/api/health',
    scanner: '/api/scanner',
    assets: '/api/assets',
  },
};

app.get('/', (_request, response) => {
  response.json(apiInfo);
});

app.get('/api', (_request, response) => {
  response.json(apiInfo);
});

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    app: 'API do Holding Radar',
  });
});

app.use('/api/assets', assetsRouter);
app.use('/api/scanner', scannerRouter);
app.use('/api/ai', aiRouter);

app.use((_request, response) => {
  response.status(404).json({
    message: 'Rota não encontrada.',
  });
});

app.use(
  (
    error: Error,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    console.error('Erro não tratado na API:', error);

    response.status(500).json({
      message:
        process.env.NODE_ENV === 'production'
          ? 'Erro interno no servidor.'
          : error.message,
    });
  },
);

import cors from 'cors';
import express from 'express';

import { aiRouter } from './routes/ai';
import { assetsRouter } from './routes/assets';

export const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    app: 'Holding Radar API',
  });
});

app.use('/api/assets', assetsRouter);
app.use('/api/ai', aiRouter);

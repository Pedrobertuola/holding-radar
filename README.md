# Holding Radar

Holding Radar is a full-stack TypeScript MVP for long-term fundamental analysis of Brazilian stocks and FIIs. It ranks assets with objective criteria such as quality, valuation, income, growth, and risk, then presents educational analysis without personalized investment recommendations.

The initial version uses fictional mocked data in TypeScript files, so it can be extended later with a real database or market data provider.

## Features

- Ranked dashboard for Brazilian stocks and FIIs.
- Filters for all assets, stocks, FIIs, income focus, growth focus, and balanced profiles.
- Asset cards with final score, status label, score breakdown, and a short summary.
- Asset detail page with Recharts score visualization.
- Fundamental indicators, positive points, risk points, valuation notes, and dividend notes.
- AI-generated educational analysis in Portuguese through the OpenAI API.
- Local fallback analysis when `OPENAI_API_KEY` is not configured.
- Visible educational disclaimer in the frontend.

## Tech Stack

- Frontend: React, Vite, TypeScript
- Styling: Tailwind CSS
- Charts: Recharts
- Routing: React Router
- Backend: Node.js, Express, TypeScript
- AI: official `openai` npm package
- Data: mocked TypeScript assets

## Architecture

```text
holding-radar/
  client/                 React + Vite app
    src/components/       Reusable dashboard and detail UI
    src/pages/            Dashboard and asset detail pages
    src/services/         API client
    src/utils/            Formatting helpers
  server/                 Express API
    src/data/             Mocked assets
    src/routes/           REST routes
    src/services/         Scoring and AI analysis logic
    src/types.ts          API/domain types
```

The frontend calls `/api/assets`, `/api/assets/:ticker`, and `/api/ai/analyze`. During local development, Vite proxies `/api` requests to the Express server on port `4000`.

## Scoring System

The scoring model produces a 0 to 100 score for each pillar:

- Quality: returns, margins, stability, governance, asset quality, and management quality.
- Price: valuation multiples, free cash flow yield, FFO yield, cap rate, or P/VP.
- Income: dividend yield, payout sustainability, and distribution stability.
- Growth: revenue growth, profit growth, and reinvestment strength for stocks.
- Risk: leverage, liquidity, concentration, vacancy, default indicators, and stability.

`calculateStockScore()` and `calculateFiiScore()` calculate pillar scores from the mocked fundamentals. `calculateFinalScore()` applies different weights for stocks and FIIs. Status labels are then assigned from the score profile:

- `Oportunidade interessante`
- `Atrativo com cautela`
- `Excelente, mas caro`
- `Barato, mas arriscado`
- `Fora dos filtros`

These labels are analytical classifications, not personalized recommendations.

## AI Usage

The backend endpoint `POST /api/ai/analyze` receives an asset object and asks OpenAI to generate a detailed fundamentalist educational analysis in Portuguese.

The prompt requires the model to explain:

- why the score is strong or weak;
- quality factors;
- price and valuation factors;
- dividend or income factors;
- growth factors when applicable;
- main risks;
- what an investor can monitor.

The endpoint uses `OPENAI_API_KEY`. If no key is available, or if the generated text violates the guardrails, the API returns a local fallback analysis.

## Disclaimer

This app is for educational purposes only and does not provide personalized investment recommendations.

All included asset values are fictional samples created for the MVP.

## Run Locally

Install dependencies if needed:

```bash
npm install --prefix client
npm install --prefix server
```

Create a server environment file:

```bash
cp server/.env.example server/.env
```

Add an OpenAI key only if you want live AI analysis:

```bash
OPENAI_API_KEY=your_api_key_here
```

Start the backend:

```bash
npm run dev:server
```

Start the frontend in another terminal:

```bash
npm run dev:client
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

Build both apps:

```bash
npm run build
```

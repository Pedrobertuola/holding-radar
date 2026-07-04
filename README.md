# Holding Radar

Holding Radar é um scanner fundamentalista full-stack em TypeScript para ações brasileiras e FIIs. O app varre um universo amplo de tickers reais, busca dados financeiros em provedores externos, remove ativos sem dados suficientes, calcula pontuações objetivas e organiza rankings educacionais.

O objetivo é mostrar oportunidades relativas dentro dos dados disponíveis, sem dizer ao usuário para comprar ou vender ativos.

## Principais Recursos

- Scanner de mercado para ações brasileiras e FIIs.
- Universo amplo e configurável de tickers reais.
- Dados financeiros vindos da Brapi, CVM Dados Abertos e Banco Central SGS.
- Cache em memória para respostas rápidas do dashboard.
- Cache persistente com Prisma e PostgreSQL para snapshots de cotações, fundamentos, dividendos, scores e análises de IA.
- Refresh manual do scanner com limite de concorrência e requisições em lote.
- Fallback para dados em cache quando provedores falham, limitam acesso ou retornam resultado parcial.
- Leitura específica de FIIs por tipo: papel, tijolo, híbrido, FoF ou desenvolvimento.
- Análise educacional com IA apenas sob demanda, nunca durante a varredura.
- Interface em português com status de dados atualizados, em cache, defasados, insuficientes ou sem permissão.

## Stack

- Frontend: React, Vite e TypeScript
- Estilização: Tailwind CSS
- Gráficos: Recharts
- Rotas: React Router
- Backend: Node.js, Express e TypeScript
- Banco: PostgreSQL + Prisma
- Deploy frontend: Vercel
- Deploy backend: Render
- IA: pacote oficial `openai`

## Arquitetura

```text
holding-radar/
  client/
    src/components/
    src/pages/
    src/services/
    src/utils/

  server/
    prisma/schema.prisma
    prisma/migrations/
    src/data/
    src/db/prisma.ts
    src/providers/
    src/routes/
    src/services/
```

## Dados E Fontes

O universo fica em:

- `server/src/data/stockUniverse.ts`
- `server/src/data/fiiUniverse.ts`

Esses arquivos armazenam somente tickers reais. Eles não armazenam preço, múltiplos, dividendos, fundamentos ou qualquer indicador financeiro.

Fontes usadas:

- Brapi: cotações, estatísticas, fundamentos e dados públicos de ativos.
- CVM Dados Abertos: informes mensais de FIIs, patrimônio, valor patrimonial por cota, cotistas, dividend yield mensal e composição agregada do ativo/passivo.
- Banco Central SGS: contexto macro de Selic, CDI e IPCA.

Para FIIs vindos da CVM, o dividend yield principal é calculado como rendimento acumulado por cota nos últimos 12 meses dividido pela cotação atual. O app não inventa imóveis individuais, devedores, garantias, indexadores ou ratings de CRIs quando esses dados não estão disponíveis em formato estruturado.

## Banco E Prisma

O schema Prisma está configurado para PostgreSQL:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

SQLite foi usado em fases locais anteriores e arquivos `.db` são ignorados. Para produção, use PostgreSQL. Para desenvolvimento local, prefira um PostgreSQL local, Neon, Supabase ou outro Postgres remoto.

Comandos do backend:

```bash
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate
npm --prefix server run prisma:deploy
npm --prefix server run prisma:studio
```

Em produção, use `prisma migrate deploy`, não `prisma migrate dev`.

## Variáveis De Ambiente

Backend (`server/.env` local ou Render):

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
BRAPI_TOKEN=your_brapi_token_here
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
CORS_ORIGIN=http://localhost:5173
BRAPI_BATCH_SIZE=10
CACHE_QUOTES_MINUTES=15
CACHE_FUNDAMENTALS_HOURS=24
CACHE_DIVIDENDS_HOURS=24
SCANNER_CACHE_MINUTES=15
MAX_CONCURRENT_REQUESTS=3
OPENAI_MODEL=gpt-4.1-mini
OPENAI_ENABLE_WEB_SEARCH=false
```

Frontend (`client/.env` local ou Vercel):

```bash
VITE_API_URL=http://localhost:3001
```

Nunca exponha `DATABASE_URL`, `BRAPI_TOKEN` ou `OPENAI_API_KEY` no frontend. A Vercel deve receber somente variáveis iniciadas por `VITE_`.

## Como Rodar Localmente

Instale as dependências:

```bash
npm install
```

Crie os arquivos de ambiente:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Configure um PostgreSQL e atualize `DATABASE_URL`.

Gere o Prisma Client e aplique migrations locais:

```bash
npm --prefix server run prisma:generate
npm --prefix server run prisma:migrate
```

Inicie o backend:

```bash
npm run dev:server
```

Inicie o frontend em outro terminal:

```bash
npm run dev:client
```

Abra:

```text
http://localhost:5173
```

Build completo:

```bash
npm run build
```

## Rotas Da API

- `GET /api/health`
- `GET /api/scanner`
- `GET /api/scanner/top?limit=10`
- `GET /api/scanner/stocks`
- `GET /api/scanner/fiis`
- `GET /api/scanner/income`
- `GET /api/scanner/growth`
- `GET /api/scanner/insufficient-data`
- `POST /api/scanner/refresh`
- `GET /api/assets`
- `GET /api/assets/:ticker`
- `POST /api/ai/analyze`

## Deploy Do Banco PostgreSQL

Opção Neon:

1. Crie um projeto em Neon.
2. Copie a connection string PostgreSQL.
3. Use a URL com SSL habilitado quando fornecida pela plataforma.
4. Cole em `DATABASE_URL` no Render.

Opção Supabase:

1. Crie um projeto em Supabase.
2. Vá em Project Settings > Database.
3. Copie a connection string PostgreSQL.
4. Cole em `DATABASE_URL` no Render.

Depois do primeiro deploy do backend, rode as migrations com:

```bash
npm --prefix server run prisma:deploy
```

No Render, o `render.yaml` já executa `npm run prisma:deploy` antes do start.

## Deploy Do Backend No Render

Você pode usar o arquivo `render.yaml` deste repositório ou configurar manualmente.

Configuração manual:

- Root directory: `server`
- Build command: `npm install && npm run prisma:generate && npm run build`
- Start command: `npm run prisma:deploy && npm run start`
- Health check path: `/api/health`

Variáveis obrigatórias no Render:

- `DATABASE_URL`
- `BRAPI_TOKEN`
- `OPENAI_API_KEY`
- `CORS_ORIGIN`
- `NODE_ENV=production`

Depois do deploy, verifique:

```text
https://sua-api.onrender.com/api/health
```

Resposta esperada:

```json
{
  "status": "ok",
  "app": "API do Holding Radar"
}
```

## Deploy Do Frontend Na Vercel

Configuração sugerida:

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`

Variável obrigatória na Vercel:

```bash
VITE_API_URL=https://sua-api.onrender.com
```

Depois de publicar o frontend, volte ao Render e configure:

```bash
CORS_ORIGIN=https://seu-app.vercel.app
```

Se usar domínios customizados, inclua o domínio final em `CORS_ORIGIN`.

## IA

A rota `POST /api/ai/analyze` gera uma análise educacional em português para um ativo selecionado.

A IA só é liberada quando o ativo:

- foi encontrado pelo scanner;
- tem dados reais suficientes;
- recebeu pontuação válida.

O scanner nunca chama OpenAI durante a varredura. A chamada à IA acontece apenas quando o usuário clica em `Gerar análise com IA`.

`OPENAI_ENABLE_WEB_SEARCH=true` permite que a análise sob demanda use busca web da OpenAI quando a conta/modelo suportar a ferramenta. Mesmo com busca ativa, o prompt exige linguagem educacional, fontes e separação clara entre dado confirmado e lacuna de informação.

## Aviso Educacional

Este app tem fins exclusivamente educacionais e não fornece recomendações personalizadas de investimento.

O app não pergunta patrimônio, salário, idade, objetivos pessoais ou situação financeira individual.

## Erros Comuns De Deploy

- `PrismaClientInitializationError`: `DATABASE_URL` ausente, inválida ou banco inacessível.
- `P3009` ou migrations falhando: verifique se `npm run prisma:deploy` está rodando contra o banco correto.
- Erro de CORS no navegador: configure `CORS_ORIGIN` no Render com a URL final da Vercel.
- Frontend chamando localhost em produção: configure `VITE_API_URL` na Vercel e gere novo deploy.
- `401` ou `403` da Brapi: token ausente, inválido ou plano sem acesso ao endpoint.
- Timeout no Render: o primeiro scanner pode demorar por chamadas externas e cache frio.
- OpenAI sem resposta: confira `OPENAI_API_KEY`, permissões do modelo e `OPENAI_ENABLE_WEB_SEARCH`.

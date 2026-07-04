# Frontend do Holding Radar

Aplicação React + Vite + TypeScript do scanner de mercado Holding Radar.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

Configure `VITE_API_URL` para apontar para o backend:

```bash
VITE_API_URL=http://localhost:3001
```

O dashboard consome `/api/scanner` pelo backend e não chama Brapi, CVM, Banco Central ou OpenAI diretamente pelo navegador.

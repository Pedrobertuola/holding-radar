import type { AiAnalysisResponse, Asset, ScannerResult } from '../types';

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const requestJson = async <T>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  if (!apiBaseUrl) {
    throw new Error(
      'API não configurada. Defina VITE_API_URL na Vercel com a URL pública do backend no Render.',
    );
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
  } catch {
    throw new Error(
      `Não foi possível conectar à API em ${apiBaseUrl}. Verifique se o backend no Render está ativo e se CORS_ORIGIN permite o domínio da Vercel.`,
    );
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Falha na requisição: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const getAssets = async () => {
  const data = await requestJson<{ assets: Asset[] }>('/api/assets');
  return data.assets;
};

export const getScanner = async () => requestJson<ScannerResult>('/api/scanner');

export const refreshScanner = async () =>
  requestJson<ScannerResult>('/api/scanner/refresh', {
    method: 'POST',
  });

export const getAsset = async (ticker: string) => {
  const data = await requestJson<{ asset: Asset }>(`/api/assets/${ticker}`);
  return data.asset;
};

export const generateAiAnalysis = async (asset: Asset) =>
  requestJson<AiAnalysisResponse>('/api/ai/analyze', {
    method: 'POST',
    body: JSON.stringify({ ticker: asset.ticker }),
  });

import type { AiAnalysisResponse, Asset, ScannerResult } from '../types';

const rawApiBaseUrl = import.meta.env.VITE_API_URL ?? '';
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '').replace(/\/api$/, '');

const requestJson = async <T>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  if (!apiBaseUrl) {
    throw new Error(
      'API não configurada. Defina VITE_API_URL na Vercel com a URL pública do backend no Render.',
    );
  }

  if (
    typeof window !== 'undefined' &&
    apiBaseUrl === window.location.origin
  ) {
    throw new Error(
      'VITE_API_URL está apontando para o frontend. Configure essa variável na Vercel com a URL pública do backend no Render.',
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
    const isHtmlError =
      response.headers.get('Content-Type')?.includes('text/html') ||
      message.trimStart().startsWith('<!DOCTYPE html>');

    if (isHtmlError) {
      throw new Error(
        `A API respondeu HTML em vez de JSON ao acessar ${apiBaseUrl}${path}. Confira se VITE_API_URL aponta para o backend no Render, não para a Vercel.`,
      );
    }

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

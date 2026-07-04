import {
  BancoCentralProvider,
  type MacroIndicators,
} from '../providers/BancoCentralProvider';

const MACRO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedMacroIndicators:
  | {
      data: MacroIndicators;
      expiresAt: number;
    }
  | null = null;

const provider = new BancoCentralProvider();

export const getMacroIndicators = async () => {
  if (cachedMacroIndicators && cachedMacroIndicators.expiresAt > Date.now()) {
    return cachedMacroIndicators.data;
  }

  try {
    const data = await provider.getLatestMacroIndicators();
    cachedMacroIndicators = {
      data,
      expiresAt: Date.now() + MACRO_CACHE_TTL_MS,
    };

    return data;
  } catch (error) {
    console.warn('Não foi possível carregar indicadores macro do Banco Central:', error);
    return undefined;
  }
};

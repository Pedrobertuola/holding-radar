import type { ScannerResult } from '../types';
import { scannerCacheMinutes } from './staleDataService';

let cachedScannerResult: { result: ScannerResult; expiresAt: number } | null = null;

export const getScannerMemoryCache = () => {
  if (!cachedScannerResult || cachedScannerResult.expiresAt <= Date.now()) {
    return null;
  }

  return cachedScannerResult.result;
};

export const setScannerMemoryCache = (result: ScannerResult) => {
  cachedScannerResult = {
    result,
    expiresAt: Date.now() + scannerCacheMinutes() * 60 * 1000,
  };
};

export const clearScannerMemoryCache = () => {
  cachedScannerResult = null;
};

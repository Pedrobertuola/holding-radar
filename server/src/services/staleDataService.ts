export const getEnvNumber = (key: string, fallback: number) => {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const scannerCacheMinutes = () =>
  getEnvNumber('SCANNER_CACHE_MINUTES', 15);

export const quoteFreshMinutes = () => getEnvNumber('CACHE_QUOTES_MINUTES', 15);

export const fundamentalsFreshHours = () =>
  getEnvNumber('CACHE_FUNDAMENTALS_HOURS', 24);

export const dividendsFreshHours = () =>
  getEnvNumber('CACHE_DIVIDENDS_HOURS', 24);

export const maxConcurrentRequests = () =>
  getEnvNumber('MAX_CONCURRENT_REQUESTS', 3);

export const isFresh = (date: Date, maxAgeMs: number) =>
  Date.now() - date.getTime() <= maxAgeMs;

export const isQuoteFresh = (date: Date) =>
  isFresh(date, quoteFreshMinutes() * 60 * 1000);

export const isFundamentalsFresh = (date: Date) =>
  isFresh(date, fundamentalsFreshHours() * 60 * 60 * 1000);

export const isDividendsFresh = (date: Date) =>
  isFresh(date, dividendsFreshHours() * 60 * 60 * 1000);

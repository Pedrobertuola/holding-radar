import { BancoCentralProvider } from './BancoCentralProvider';
import { BrapiProvider } from './BrapiProvider';
import { CvmProvider } from './CvmProvider';
import type { MarketDataProvider } from './MarketDataProvider';

const providers: MarketDataProvider[] = [new BrapiProvider(), new CvmProvider()];
const macroProviders = [new BancoCentralProvider()];

export const getPrimaryProvider = () => providers[0];

export const getProviderFallbacks = () => providers.slice(1);

export const getProviders = () => providers;

export const getMacroProviders = () => macroProviders;

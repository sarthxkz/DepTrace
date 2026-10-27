import { loadPrices } from './pricing';

export const discounted = () => loadPrices().map((price) => price * 0.9);

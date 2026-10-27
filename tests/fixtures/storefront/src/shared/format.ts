import { round, type Money } from './money';

export const formatMoney = (value: Money) => `$${round(value).toFixed(2)}`;

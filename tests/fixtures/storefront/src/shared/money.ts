export type Money = number;

export const sum = (values: Money[]): Money => values.reduce((a, b) => a + b, 0);
export const round = (value: Money): Money => Math.round(value * 100) / 100;

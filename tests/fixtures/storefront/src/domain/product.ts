import type { Money } from '../shared/money';

export class Product {
  constructor(
    readonly name: string,
    readonly price: Money,
  ) {}
}

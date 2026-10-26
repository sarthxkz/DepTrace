import { Money } from './money';

export class Order {
  private constructor(
    readonly id: string,
    readonly total: Money,
  ) {}

  static create(id: string, amount: number) {
    return new Order(id, new Money(amount));
  }
}

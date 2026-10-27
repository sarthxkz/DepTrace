import type { Cart } from './cart';
import type { Invoice } from './invoice';

export class Order {
  invoice: Invoice | null = null;
  constructor(readonly cart: Cart) {}
}

import type { Product } from './product';
import { sum } from '../shared/money';

export class Cart {
  items: Product[] = [];
  total(): number {
    return sum(this.items.map((item) => item.price));
  }
}

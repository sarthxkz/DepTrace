// Type-only cycle with order.ts: erased at runtime.
import type { Order } from './order';

export interface Invoice {
  order: Order;
}

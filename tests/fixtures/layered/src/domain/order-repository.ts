import type { Order } from './order';

export interface OrderRepository {
  save(order: Order): Promise<void>;
}

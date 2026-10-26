import { Order } from '../domain/order';
import type { OrderRepository } from '../domain/order-repository';
import { notifyPlaced } from './notify';

export class PlaceOrder {
  constructor(private readonly repository: OrderRepository) {}

  async execute(id: string, amount: number) {
    const order = Order.create(id, amount);
    await this.repository.save(order);
    notifyPlaced(this);
    return order;
  }
}

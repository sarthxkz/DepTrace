import type { PlaceOrder } from '../../application/place-order';

export class OrderController {
  constructor(private readonly placeOrder: PlaceOrder) {}

  handle(body: { id: string; amount: number }) {
    return this.placeOrder.execute(body.id, body.amount);
  }
}

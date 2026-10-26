import { PlaceOrder } from './place-order';

export function notifyPlaced(source: unknown) {
  return source instanceof PlaceOrder;
}

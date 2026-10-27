import type { Cart } from '../domain/cart';
import { Order } from '../domain/order';
import { charge } from './payment';

export function checkout(cart: Cart): Order {
  charge(cart.total());
  return new Order(cart);
}

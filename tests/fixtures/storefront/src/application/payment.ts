// Runtime cycle: cart-service -> checkout -> payment -> cart-service.
import { cartTotal } from './cart-service';

export function charge(amount: number): boolean {
  return amount === cartTotal();
}

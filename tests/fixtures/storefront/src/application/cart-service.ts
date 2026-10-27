import { Cart } from '../domain/cart';
import { checkout } from './checkout';

const cart = new Cart();

export function cartTotal() {
  return cart.total();
}

export const submitCart = () => checkout(cart);

import { cartTotal } from '../application/cart-service';
import { formatMoney } from '../shared/format';

export function renderCart(): string {
  return formatMoney(cartTotal());
}

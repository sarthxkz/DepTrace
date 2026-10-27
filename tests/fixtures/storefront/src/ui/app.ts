import { renderCart } from './cart-view';
import { renderProducts } from './product-list';

export function renderApp(): string {
  return renderProducts() + renderCart();
}

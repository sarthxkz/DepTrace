import { listProducts } from '../application/catalog-service';
// Violation: the UI talks to the database directly.
import { createClient } from '../infrastructure/db/client';

export function renderProducts(): string {
  createClient();
  return listProducts().join(', ');
}

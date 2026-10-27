import { Product } from '../domain/product';
import type { ProductRepository } from '../domain/product-repository';
// Violation (warning): production code uses a test double.
import { FakeStore } from '../testing/fake-store';

const repository: ProductRepository = new FakeStore();

export function listProducts(): string[] {
  return repository.all().map((product: Product) => product.name);
}

import type { Product } from '../domain/product';
import type { ProductRepository } from '../domain/product-repository';

export class FakeStore implements ProductRepository {
  all(): Product[] {
    return [];
  }
}

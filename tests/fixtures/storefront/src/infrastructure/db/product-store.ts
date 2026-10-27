import type { Product } from '../../domain/product';
import type { ProductRepository } from '../../domain/product-repository';
import { createClient } from './client';

export class ProductStore implements ProductRepository {
  client = createClient();
  all(): Product[] {
    return [];
  }
}

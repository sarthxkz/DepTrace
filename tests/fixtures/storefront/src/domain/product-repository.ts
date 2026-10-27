import type { Product } from './product';

export interface ProductRepository {
  all(): Product[];
}

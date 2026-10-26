import { addItem } from '../../cart/internal/state';
import { addItem as addViaIndex } from '../../cart';

export const CatalogPage = () => [addItem('a'), addViaIndex('b')];

import { PostgresOrderRepository } from '../infrastructure/db/order-repository';
import { formatLegacy } from '../legacy/format';

export const run = () => formatLegacy(String(new PostgresOrderRepository()));

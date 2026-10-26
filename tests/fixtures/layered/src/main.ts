import { createServer } from './infrastructure/http/server';
import { OrderController } from './presentation/http/order-controller';
import { PostgresOrderRepository } from './infrastructure/db/order-repository';
import { PlaceOrder } from './application/place-order';

const repository = new PostgresOrderRepository();
export const server = createServer(new OrderController(new PlaceOrder(repository)));

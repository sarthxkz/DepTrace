import type { Order } from '../../domain/order';
import type { OrderRepository } from '../../domain/order-repository';
import { pool } from './connection';

export class PostgresOrderRepository implements OrderRepository {
  async save(order: Order) {
    await pool.query(`insert into orders values ('${order.id}')`);
  }
}

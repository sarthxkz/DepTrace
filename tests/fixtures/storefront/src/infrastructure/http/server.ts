import express from 'express';
import type { Pool } from 'pg';
import { submitCart } from '../../application/cart-service';
// Unresolved: the file does not exist.
import { port } from '../../config/env';

export function startServer(pool: Pool): void {
  void pool;
  void submitCart;
  express().listen(port);
}

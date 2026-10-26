import express from 'express';
import type { OrderController } from '../../presentation/http/order-controller';

// VIOLATION (layer-boundaries): infrastructure may import application and domain, not presentation.
export const createServer = (controller: OrderController) => ({ app: express(), controller });

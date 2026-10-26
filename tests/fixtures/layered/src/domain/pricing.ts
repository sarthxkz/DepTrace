import type { Request } from 'express';
import { pool } from '../infrastructure/db/connection';
import { Money } from './money';

export const priceFrom = (request: Request) => new Money(Number(request.body) + Number(Boolean(pool)));

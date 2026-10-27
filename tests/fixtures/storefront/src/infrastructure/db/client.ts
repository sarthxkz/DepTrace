import { Pool } from 'pg';

export function createClient(): Pool {
  return new Pool();
}

// Violations: a Node.js API and the database in the domain layer.
import { readFileSync } from 'fs';
import { createClient } from '../infrastructure/db/client';
import { round } from '../shared/money';

export function loadPrices(): number[] {
  createClient();
  return JSON.parse(readFileSync('prices.json', 'utf8')).map(round);
}

import type { api } from './services/api';

export interface Config {
  api: typeof api;
}

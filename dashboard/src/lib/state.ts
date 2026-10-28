import type { AuditReport } from '../contract/audit';
import type { Loaded } from '../contract/load';
import type { Model } from '../model/model';
import type { ServerMeta } from './api';

/** Where the loaded document came from. */
export type Source =
  { kind: 'server'; meta: ServerMeta; live: boolean } | { kind: 'file'; name: string };

/** A loaded, validated document and its indexed graph. */
export interface Ready {
  loaded: Loaded;
  /** Only for full reports; findings-only documents have no graph. */
  model: Model | null;
  source: Source;
}

/** The dependency audit: never run until the user asks, because it uses the network. */
export type AuditState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; report: AuditReport; origin: 'server' | 'file'; name: string }
  | { status: 'error'; message: string; problems: string[] };

export interface AuditControl {
  state: AuditState;
  /** True when the server can run the audit (a live analysis, not a report file). */
  canRun: boolean;
  run: () => void;
  load: (file: File) => void;
}

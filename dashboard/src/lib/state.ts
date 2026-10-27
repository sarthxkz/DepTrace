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

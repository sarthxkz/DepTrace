import { compileMatcher } from './patterns.js';
import type { Layer } from './types.js';

/** Maps files to layers: the first layer (in configuration order) with a matching pattern. */
export function createLayerResolver(layers: readonly Layer[]): (file: string) => string | null {
  const compiled = layers.map((layer) => ({
    name: layer.name,
    matches: compileMatcher(layer.files),
  }));
  const cache = new Map<string, string | null>();
  return (file) => {
    let layer = cache.get(file);
    if (layer === undefined) {
      layer = compiled.find((entry) => entry.matches(file))?.name ?? null;
      cache.set(file, layer);
    }
    return layer;
  };
}

/**
 * Maps files to modules: the shallowest ancestor directory matching one of the
 * `modules` globs (e.g. `src/features/*` makes `src/features/cart` a module).
 */
export function createModuleResolver(modules: readonly string[]): (file: string) => string | null {
  const matches = compileMatcher(modules);
  const cache = new Map<string, string | null>();
  return (file) => {
    let module = cache.get(file);
    if (module === undefined) {
      module = null;
      const segments = file.split('/');
      for (let length = 1; length < segments.length; length++) {
        const directory = segments.slice(0, length).join('/');
        if (matches(directory)) {
          module = directory;
          break;
        }
      }
      cache.set(file, module);
    }
    return module;
  };
}

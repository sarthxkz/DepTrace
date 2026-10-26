# Performance

## Design

- Discovery is one iterative walk (no recursion, no symlink following).
- Each file is read and parsed **once**, sequentially. Only its import list is kept; the AST and
  text are released before the next file, so memory grows with the number of imports, not with
  source size.
- Resolution uses one TypeScript module resolution cache per tsconfig, plus per-scan memoization
  of file and directory existence checks and `realpath` calls.
- The graph uses adjacency lists of integer node indices. Edge lookup is a hash map keyed by
  `(from, to)`. Building the graph, Tarjan's SCC algorithm (two passes: all edges, runtime edges)
  and every cycle's representative path are linear in nodes plus edges.
- There is no concurrency. The analysis loop yields to the event loop every 200 files so Ctrl+C
  and progress output stay responsive. Progress (`Analyzing n/N files...`) is written to stderr,
  only when stderr is a terminal.
- Analysis commands load the TypeScript compiler on demand, which takes roughly 0.3–0.5 s. Other
  commands (`--help`, `--version`, `init`) do not load it.

## Reproducing the measurements

```sh
npm run bench                        # synthetic repositories with 1 000 and 10 000 files
npm run bench -- --files 500,20000   # other sizes
npm run bench -- --dir <path>        # an existing directory (default include, no deptrace.yml)
npm run bench -- --generate <dir> --files 5000   # write the synthetic repository only
```

The synthetic repository is generated from a fixed seed (`scripts/benchmark.ts`): TypeScript files
of about 1.5 KB with 3–6 imports each, 20% type-only, 10% through a `paths` alias, about 2%
pointing "forward" (which forms cycles), and 30% importing one of ten stub packages. Each
measurement runs in a fresh child process. "Analysis" is the engine's own duration
(`summary.durationMs`: discovery, parsing, resolution, graph and cycles), without Node.js startup
or TypeScript loading. "Peak RSS" is the child process's maximum resident set size, including
Node.js and the loaded TypeScript compiler.

## Measured results

Environment: Windows 11, Intel Core i3-1005G1 (1.20 GHz, 2 cores / 4 threads), 16 GB RAM,
Node.js 24.13.1, TypeScript 6.0.3, measured 2026-10-26. Synthetic repositories were generated in
the system temp directory on an SSD; the `node_modules` inputs were read from a hard disk (HDD).
The synthetic rows were run twice (both runs shown); the others once.

| Input                                        |  Files | Import refs |  Nodes |  Edges | Cyclic SCCs |            Analysis |        Peak RSS |
| -------------------------------------------- | -----: | ----------: | -----: | -----: | ----------: | ------------------: | --------------: |
| Synthetic, 1 000 files                       |  1 000 |       4 751 |  1 000 |  4 407 |           1 |     984 ms / 966 ms | 187 MB / 165 MB |
| Synthetic, 10 000 files                      | 10 000 |      47 949 | 10 000 | 44 870 |           1 | 7 391 ms / 6 942 ms | 303 MB / 300 MB |
| `eslint/lib` (CommonJS, from `node_modules`) |    394 |         795 |    394 |    665 |           0 |              868 ms |          175 MB |
| `@typescript-eslint/eslint-plugin/dist`      |    474 |       1 355 |    474 |    531 |           1 |              859 ms |          159 MB |
| `vitest/dist`                                |     79 |         899 |     79 |    464 |           1 |            1 079 ms |          208 MB |

The synthetic repositories form a single large cyclic component because forward imports connect
most files; this exercises the SCC and representative-path code on a big component.

Before the filesystem memoization and `realpath` shortcut were added, the same 10 000-file
benchmark took 11 519 ms on this machine (same graph: 44 870 edges). A CPU profile of a 3 000-file
run showed reading files and filesystem checks as the largest remaining costs.

These numbers describe one machine. They are not a guarantee for other hardware or repositories.

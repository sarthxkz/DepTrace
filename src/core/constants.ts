export const PRODUCT_NAME = 'DepTrace';
export const CLI_NAME = 'deptrace';
export const TAGLINE = 'See your architecture. Catch violations before they ship.';
export const CONFIG_FILENAME = 'deptrace.yml';
export const PHASE_STATUS = 'Phase 1 (foundation): repository inspection only';

/** Process exit codes. See README.md "Exit codes". */
export const ExitCode = {
  Success: 0,
  OperationalError: 1,
  UsageError: 2,
  /** Reserved for future architecture violations; never returned in Phase 1. */
  ArchitectureViolations: 3,
  NotImplemented: 4,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

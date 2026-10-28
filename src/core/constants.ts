export const PRODUCT_NAME = 'DepTrace';
export const CLI_NAME = 'deptrace';
export const TAGLINE = 'See your architecture. Catch violations before they ship.';
export const CONFIG_FILENAME = 'deptrace.yml';

/** Process exit codes. See README.md "Exit codes". */
export const ExitCode = {
  Success: 0,
  OperationalError: 1,
  UsageError: 2,
  /** `check` found failing architecture violations. */
  ArchitectureViolations: 3,
  /** Functionality not implemented. No command returns it today. */
  NotImplemented: 4,
  /** `audit` found vulnerable packages at or above `--fail-on`. */
  Vulnerabilities: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

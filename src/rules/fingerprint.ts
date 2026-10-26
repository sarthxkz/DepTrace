import { createHash } from 'node:crypto';

/**
 * Stable violation identity: SHA-256 (first 16 hex characters) of the rule id
 * and repository-relative identities. Line numbers and absolute paths are
 * deliberately excluded, so moving code within a file or relocating the
 * repository does not change it.
 */
export function fingerprint(ruleId: string, ...parts: string[]): string {
  return createHash('sha256')
    .update([ruleId, ...parts].join('\0'))
    .digest('hex')
    .slice(0, 16);
}

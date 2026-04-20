import type { CLIProfile, DetectionResult } from '../../domain/settings.js';

/**
 * Merge `command -v` results into profile executables.
 * If planner.executable === cursor.executable before merge, planner tracks cursor path.
 */
export function mergeDetectedPathsIntoProfile(
  profile: CLIProfile,
  results: DetectionResult[]
): { next: CLIProfile; changed: boolean } {
  const plannerMatchedCursor = profile.planner.executable === profile.cursor.executable;
  let updated: CLIProfile = { ...profile };
  let changed = false;

  for (const row of results) {
    if (!row.found || !row.path) continue;
    if (row.executable === 'cursor-agent') {
      if (updated.cursor.executable !== row.path) {
        updated = { ...updated, cursor: { ...updated.cursor, executable: row.path } };
        changed = true;
      }
      if (plannerMatchedCursor && updated.planner.executable !== row.path) {
        updated = { ...updated, planner: { ...updated.planner, executable: row.path } };
        changed = true;
      }
      continue;
    }
    if (row.executable === 'codex' && updated.codex.executable !== row.path) {
      updated = { ...updated, codex: { ...updated.codex, executable: row.path } };
      changed = true;
      continue;
    }
    if (row.executable === 'claude' && updated.claude.executable !== row.path) {
      updated = { ...updated, claude: { ...updated.claude, executable: row.path } };
      changed = true;
    }
  }

  return { next: updated, changed };
}

import { mergeDetectedPathsIntoProfile } from '../../contracts/settings/cli-detect-merge.js';
import { CLIRunner } from './cli-runner.js';
import { detectCliEnvironmentPaths } from './cli-environment-detect.js';
import { loadProfile, saveProfile } from './store.js';

/**
 * Resolve cursor-agent / codex / claude via login shell and persist absolute paths.
 * Called on server startup so runs use the same binaries as `command -v` without a UI click.
 */
export async function autoDetectAndSaveProfile(): Promise<boolean> {
  const profile = loadProfile();
  const cli = new CLIRunner();
  const results = await detectCliEnvironmentPaths(cli);
  const { next, changed } = mergeDetectedPathsIntoProfile(profile, results);
  if (changed) {
    saveProfile(next);
    console.log('[AgentCadence] CLI executable paths updated from startup auto-detect.');
  }
  return changed;
}

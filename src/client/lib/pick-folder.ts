import { api } from './api';

/** Opens native folder picker (server-side). Returns null if cancelled or failed. */
export async function pickWorkingDirectory(): Promise<string | null> {
  const r = await api.pickFolder();
  if ('cancelled' in r && r.cancelled) return null;
  if ('path' in r && r.path) return r.path;
  return null;
}

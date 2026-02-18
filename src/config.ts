/**
 * Config resolution: .env, repos.json, REPOS_ROOT default.
 */

import * as path from 'path';
import * as fs from 'fs';

/** Directory containing .env, prompt.md, repos.json (package root when run from dist/) */
export function getConfigDir(): string {
  const fromDist = path.join(__dirname, '..');
  return fromDist;
}

export function loadReposList(configDir: string): string[] {
  const reposPath = path.join(configDir, 'repos.json');
  try {
    const content = fs.readFileSync(reposPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

export function getReposRoot(): string {
  const root = process.env.REPOS_ROOT;
  if (root) return root;
  if (process.platform === 'win32') return 'c:\\code\\repos';
  return path.join(process.env.HOME || '~', 'code', 'repos');
}

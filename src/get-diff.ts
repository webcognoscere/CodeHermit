/**
 * Gets the diff between a base branch and a head (PR) branch.
 * Uses git diff base...head (three-dot) so we only see changes introduced by the PR.
 * Writes the diff to a file for the Cursor agent to read.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export const DEFAULT_BASE = 'main';
export const DIFF_FILE_BASE = '.codehermit-diff.txt';

export function getRepoRoot(cwd?: string): string {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd: cwd || process.cwd(),
    }).trim();
  } catch {
    throw new Error('Not inside a git repository. Run this from your repo root.');
  }
}

function fetchBranch(repoRoot: string, branch: string): void {
  try {
    execSync(`git fetch origin ${branch}`, { cwd: repoRoot, stdio: 'pipe' });
  } catch {
    console.warn(`Warning: could not fetch origin/${branch}. Using local refs.`);
  }
}

function toRef(ref: string): string {
  if (ref.startsWith('origin/') || ref.startsWith('refs/')) return ref;
  return `origin/${ref}`;
}

function getDiffContent(repoRoot: string, baseRef: string, headRef: string): string {
  const base = toRef(baseRef);
  const head = toRef(headRef);
  try {
    return execSync(`git diff ${base}...${head}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'stdout' in e && e.stdout) return String(e.stdout);
    throw new Error(`Failed to get diff: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface GetDiffOptions {
  repoRoot: string;
  baseBranch: string;
  headBranch: string;
  /** Filename only (e.g. .182370.codehermit-diff.txt). Default .codehermit-diff.txt */
  diffFileName?: string;
  /** If set, write diff to this path instead of repoRoot/diffFileName */
  writePath?: string;
}

export interface GetDiffResult {
  diffPath: string;
  repoRoot: string;
  baseBranch: string;
  headBranch: string;
  diffLength: number;
  diffContent: string;
}

/**
 * Get diff between base and head branch, write to file.
 * If diffFileName is provided (e.g. .182370.codehermit-diff.txt), use it; else use .codehermit-diff.txt
 */
export function getDiff(options: GetDiffOptions): GetDiffResult {
  const { repoRoot, baseBranch, headBranch, diffFileName, writePath } = options;
  const fileName = diffFileName ?? DIFF_FILE_BASE;
  fetchBranch(repoRoot, baseBranch);
  fetchBranch(repoRoot, headBranch);
  const diff = getDiffContent(repoRoot, baseBranch, headBranch);
  const diffPath = writePath ?? path.join(repoRoot, fileName);
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, diff, 'utf-8');
  console.log(`Diff written to ${diffPath} (${diff.length} chars)`);
  return { diffPath, repoRoot, baseBranch, headBranch, diffLength: diff.length, diffContent: diff };
}

/**
 * Standalone CLI: read args from argv, use current dir as repo root.
 */
export function mainFromArgv(): GetDiffResult {
  const args = process.argv.slice(2);
  const baseBranch = args[0] || DEFAULT_BASE;
  let headBranch = args[1];
  if (!headBranch) {
    try {
      headBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    } catch {
      // no git
    }
  }
  if (!headBranch) {
    console.error('Could not detect current branch. Pass base and head explicitly.');
    process.exit(1);
  }
  const repoRoot = getRepoRoot();
  return getDiff({ repoRoot, baseBranch, headBranch });
}

if (require.main === module) {
  try {
    mainFromArgv();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

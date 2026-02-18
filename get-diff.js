#!/usr/bin/env node
/**
 * Gets the diff between a base branch and a head (PR) branch.
 * Uses git diff base...head (three-dot) so we only see changes introduced by the PR.
 * Writes the diff to a file for the Cursor agent to read.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_BASE = 'main';
const DIFF_FILE = '.codehermit-diff.txt';

function getRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error('Not inside a git repository. Run this from your repo root.');
  }
}

function fetchBranch(repoRoot, branch) {
  try {
    execSync(`git fetch origin ${branch}`, { cwd: repoRoot, stdio: 'pipe' });
  } catch (e) {
    console.warn(`Warning: could not fetch origin/${branch}. Using local refs.`);
  }
}

function toRef(ref) {
  // Already a remote or full ref (origin/..., refs/...)
  if (ref.startsWith('origin/') || ref.startsWith('refs/')) return ref;
  return `origin/${ref}`;
}

function getDiff(repoRoot, baseRef, headRef) {
  const base = toRef(baseRef);
  const head = toRef(headRef);
  try {
    return execSync(`git diff ${base}...${head}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e) {
    if (e.stdout) return e.stdout;
    throw new Error(`Failed to get diff: ${e.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const baseBranch = args[0] || DEFAULT_BASE;
  const headBranch = args[1] || execSync('git branch --show-current', { encoding: 'utf-8' }).trim();

  if (!headBranch) {
    console.error('Could not detect current branch. Pass base and head explicitly.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  fetchBranch(repoRoot, baseBranch);
  fetchBranch(repoRoot, headBranch);

  const diff = getDiff(repoRoot, baseBranch, headBranch);
  const diffPath = path.join(repoRoot, DIFF_FILE);
  fs.writeFileSync(diffPath, diff, 'utf-8');

  console.log(`Diff written to ${diffPath} (${diff.length} chars)`);
  return { diffPath, repoRoot, baseBranch, headBranch, diffLength: diff.length, diffContent: diff };
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { main, getRepoRoot, DIFF_FILE };

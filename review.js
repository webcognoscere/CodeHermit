#!/usr/bin/env node
/**
 * CodeHermit: generates a diff between base and head branch, then invokes
 * the Cursor CLI agent to review the changes.
 *
 * Usage:
 *   node review.js [baseBranch] [headBranch]
 *   node review.js main feature/my-pr
 *
 * Requires: Cursor CLI installed (https://cursor.com/docs/cli/overview)
 *   Windows: irm 'https://cursor.com/install?win32=true' | iex
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { main: getDiff } = require('./get-diff.js');

const OUTPUT_FILE = '.codehermit-output.md';
const PROMPT_FILE = 'prompt.md';
const ENV_FILE = '.env';

function loadEnv() {
  const envPath = path.join(__dirname, ENV_FILE);
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) {
        const value = match[2].replace(/^["']|["']$/g, '').trim();
        process.env[match[1]] = value;
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Warning: could not load .env:', e.message);
  }
}

function loadPrompt() {
  const promptPath = path.join(__dirname, PROMPT_FILE);
  try {
    return fs.readFileSync(promptPath, 'utf-8').trim();
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(`Prompt file not found: ${promptPath}`);
      console.error('Create prompt.md in the same folder as review.js, or restore the default.');
    } else {
      console.error('Failed to read prompt file:', e.message);
    }
    process.exit(1);
  }
}

function getAgentCommand() {
  const explicit = process.env.AGENT_PATH || process.env.CURSOR_AGENT_PATH;
  if (explicit) return explicit;
  return 'agent';
}

function runCursorAgent(repoRoot) {
  const prompt = loadPrompt();
  const agentCmd = getAgentCommand();
  const outPath = path.join(repoRoot, OUTPUT_FILE);
  const fileStream = fs.createWriteStream(outPath, { encoding: 'utf-8' });

  const child = spawn(agentCmd, ['--trust', '-p', prompt], {
    cwd: repoRoot,
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: true,
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    fileStream.write(chunk);
  });
  child.stdout.on('end', () => fileStream.end());

  child.on('error', (err) => {
    fileStream.end();
    if (err.code === 'ENOENT') {
      console.error('\nAgent CLI not found.');
      console.error('  If \'agent\' works in your terminal, set AGENT_PATH to its full path, e.g.:');
      console.error('    PowerShell: $env:AGENT_PATH = (Get-Command agent).Source');
      console.error('    Then run this script again from the same terminal.');
      console.error('  Or install Cursor CLI: irm \'https://cursor.com/install?win32=true\' | iex');
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    fileStream.end();
    console.error('\nReview saved to', outPath);
    process.exit(code ?? 0);
  });
}

function main() {
  loadEnv();
  const { repoRoot, baseBranch, headBranch, diffContent } = getDiff();
  console.log(`Reviewing PR: ${baseBranch}...${headBranch} (${(diffContent.length / 1024).toFixed(1)} KB)\n`);
  runCursorAgent(repoRoot);
}

main();

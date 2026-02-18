/**
 * CodeHermit: invokes the Cursor CLI agent to review a diff file.
 * Loads prompt from prompt.md and .env from config dir.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PROMPT_FILE = 'prompt.md';
const ENV_FILE = '.env';

export function loadEnv(configDir: string): void {
  const envPath = path.join(configDir, ENV_FILE);
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
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && e.code !== 'ENOENT') {
      console.error('Warning: could not load .env:', (e as NodeJS.ErrnoException).message);
    }
  }
}

export function loadPrompt(configDir: string): string {
  const promptPath = path.join(configDir, PROMPT_FILE);
  try {
    return fs.readFileSync(promptPath, 'utf-8').trim();
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`Prompt file not found: ${promptPath}`);
      console.error('Create prompt.md in the config folder, or restore the default.');
    } else {
      console.error('Failed to read prompt file:', e instanceof Error ? e.message : String(e));
    }
    process.exit(1);
  }
}

/**
 * Returns the command and base args for spawning the agent.
 * When AGENT_PATH points to a .ps1 file, runs it via PowerShell so it executes on Windows.
 */
export function getAgentSpawnOptions(): { command: string; args: string[] } {
  const explicit = process.env.AGENT_PATH || process.env.CURSOR_AGENT_PATH;
  const agentPath = explicit || 'agent';
  const lower = agentPath.toLowerCase();
  if (lower.endsWith('.ps1')) {
    return {
      command: 'powershell',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', agentPath],
    };
  }
  return { command: agentPath, args: [] };
}

export interface RunReviewOptions {
  /** Directory to run the agent in (where the diff file is and where output will be written) */
  cwd: string;
  /** Name of the diff file in cwd (e.g. .182370.codehermit-diff.txt or .codehermit-diff.txt) */
  diffFileName: string;
  /** Full path where the review markdown should be written */
  outputPath: string;
  /** Config dir for loading prompt (prompt text is built with diff file name) */
  configDir: string;
}

export function runReview(options: RunReviewOptions): void {
  const { cwd, diffFileName, outputPath, configDir } = options;
  const promptTemplate = loadPrompt(configDir);
  // Ensure prompt references the actual diff file name in this workspace
  const prompt = promptTemplate.replace(
    /\.codehermit-diff\.txt/g,
    diffFileName
  );
  const { command: agentCmd, args: agentBaseArgs } = getAgentSpawnOptions();
  const fileStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  process.stderr.write('Running Cursor agent to review the diff (this may take a minute or two)...\n');
  const spinnerFrames = ['|', '/', '-', '\\'];
  let spinnerIndex = 0;
  const spinner = setInterval(() => {
    process.stderr.write(`\r  ${spinnerFrames[spinnerIndex++ % spinnerFrames.length]} Working `);
  }, 80);

  const child = spawn(agentCmd, [...agentBaseArgs, '--trust', '-p', prompt], {
    cwd,
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: true,
  });

  let firstChunk = true;
  child.stdout?.on('data', (chunk: Buffer) => {
    if (firstChunk) {
      firstChunk = false;
      clearInterval(spinner);
      process.stderr.write('\r   \r');
    }
    process.stdout.write(chunk);
    fileStream.write(chunk);
  });
  child.stdout?.on('end', () => {
    if (firstChunk) clearInterval(spinner);
    process.stderr.write('\r   \r');
    fileStream.end();
  });

  child.on('error', (err: NodeJS.ErrnoException) => {
    clearInterval(spinner);
    process.stderr.write('\r   \r');
    fileStream.end();
    if (err.code === 'ENOENT') {
      console.error('\nAgent CLI not found.');
      console.error("  If 'agent' works in your terminal, set AGENT_PATH to its full path, e.g.:");
      console.error('    PowerShell: $env:AGENT_PATH = (Get-Command agent).Source');
      console.error('    Then run this script again from the same terminal.');
      console.error("  Or install Cursor CLI: irm 'https://cursor.com/install?win32=true' | iex");
    } else {
      console.error(err);
    }
    process.exit(1);
  });

  child.on('exit', (code: number | null) => {
    clearInterval(spinner);
    process.stderr.write('\r   \r');
    fileStream.end();
    console.error('\nReview saved to', outputPath);
    process.exit(code ?? 0);
  });
}

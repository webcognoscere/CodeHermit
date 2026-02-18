#!/usr/bin/env node
/**
 * CodeHermit CLI: invokable from any directory.
 * Supports Azure mode (PR ID or URL) and direct mode (base + head branch).
 */

import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { getDiff, getRepoRoot, DIFF_FILE_BASE } from './get-diff';
import { loadEnv, runReview, getAgentSpawnOptions } from './review';
import { getConfigDir, loadReposList, getReposRoot } from './config';
import {
  getPrDetails,
  parsePrUrl,
  isAzureConfigured,
  type PrDetails,
} from './plugins/azure';
import { getLogo } from './logo';

const OUTPUT_FILE_BASE = '.codehermit-output.md';

function getVersion(configDir: string): string {
  try {
    const pkgPath = path.join(configDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function printStatus(): Promise<void> {
  const configDir = getConfigDir();
  loadEnv(configDir);

  const { command: agentCmd, args: agentBaseArgs } = getAgentSpawnOptions();
  let agentInstalled = false;
  let agentVersion = '';
  try {
    const result = spawn(agentCmd, [...agentBaseArgs, '--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    result.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
    const code = await new Promise<number | null>((resolve) => {
      result.on('error', () => resolve(null));
      result.on('close', (c) => resolve(c));
    });
    if (code === 0) {
      agentInstalled = true;
      agentVersion = Buffer.concat(chunks).toString('utf-8').trim();
    }
  } catch {
    // spawn failed
  }

  const hasCursorApiKey = !!(process.env.CURSOR_API_KEY && process.env.CURSOR_API_KEY.trim());
  const azureOk = isAzureConfigured();

  console.log(getLogo());
  console.log('');
  console.log('codehermit status\n');
  console.log('Agent (Cursor CLI)');
  console.log('  Installed:  ', agentInstalled ? 'yes' : 'no');
  if (agentVersion) console.log('  Version:    ', agentVersion);
  console.log('  Auth:       ', hasCursorApiKey ? 'CURSOR_API_KEY set' : 'not set (use "agent login" or set CURSOR_API_KEY in .env)');
  console.log('');
  console.log('Azure DevOps');
  console.log('  Configured: ', azureOk ? 'yes (AZURE_ORG_URL, AZURE_PROJECT, AZURE_PAT)' : 'no');
  if (!azureOk) {
    console.log('  Set AZURE_ORG_URL, AZURE_PROJECT, AZURE_PAT in .env for PR ID / URL mode.');
  }
  console.log('');
  console.log('Config dir:  ', configDir);
}

function printHelp(): void {
  console.log(`
codehermit – Review pull requests with the Cursor CLI agent.

USAGE
  codehermit [options] [pr-id | pr-url | base-branch head-branch]

MODES
  Azure (PR ID or URL)   Fetch PR details from Azure DevOps, then run review.
  Direct (base + head)    Compare two branches (e.g. main and your PR branch).

OPTIONS
  --help                  Show this help and exit.
  --version               Print version and exit.
  --status                Print agent and Azure config status and exit.

  --pr, -p <id|url>       PR ID (e.g. 182370) or full Azure PR URL. Enables Azure mode.
  --output-dir, -o <path> Write diff and review files to this folder (e.g. "Pull Request Reviews").
                          Creates <path>/<repo-name>/ with one subfolder per repo.
  --base, -b <branch>     Base branch (e.g. main). Use with --head for direct mode.
  --head, -h <branch>     Head/PR branch. Use with --base for direct mode.
  --repo, -r <path|name> Repo path or name under REPOS_ROOT. Optional in direct mode.

EXAMPLES
  codehermit 182370
  codehermit --pr "https://dev.azure.com/Org/Project/_git/Repo/pullrequest/182370"
  codehermit main feature/my-pr
  codehermit main feature/xyz --output-dir "./Pull Request Reviews"
  codehermit main feature/xyz --repo YourOrg.YourRepo

CONFIG (from package directory, not cwd)
  .env        REPOS_ROOT, CURSOR_API_KEY, AGENT_PATH, AZURE_ORG_URL, AZURE_PROJECT, AZURE_PAT
  repos.json  List of repo names (for "Which repository?" when using --output-dir)
  prompt.md   Review instructions sent to the agent
`);
}

function createReadline(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve((answer ?? '').trim()));
  });
}

function parseArgs(argv: string[]): {
  prIdOrUrl?: string;
  base?: string;
  head?: string;
  repo?: string;
  outputDir?: string;
} {
  const result: {
    prIdOrUrl?: string;
    base?: string;
    head?: string;
    repo?: string;
    outputDir?: string;
  } = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--pr' || arg === '-p') {
      result.prIdOrUrl = argv[++i];
      i++;
      continue;
    }
    if (arg === '--output-dir' || arg === '-o') {
      result.outputDir = argv[++i];
      i++;
      continue;
    }
    if (arg === '--base' || arg === '-b') {
      result.base = argv[++i];
      i++;
      continue;
    }
    if (arg === '--head' || arg === '-h') {
      result.head = argv[++i];
      i++;
      continue;
    }
    if (arg === '--repo' || arg === '-r') {
      result.repo = argv[++i];
      i++;
      continue;
    }
    if (arg.startsWith('-')) {
      i++;
      continue;
    }
    if (!result.prIdOrUrl && !result.base) {
      if (/^\d+$/.test(arg)) {
        result.prIdOrUrl = arg;
      } else if (arg.includes('dev.azure.com') && arg.includes('pullrequest')) {
        result.prIdOrUrl = arg;
      } else {
        result.base = arg;
        result.head = argv[i + 1];
        i += 2;
      }
      i++;
      continue;
    }
    i++;
  }
  return result;
}

function sanitizeBranchForFile(branch: string): string {
  return branch.replace(/[/\\]/g, '_').replace(/\s/g, '_');
}

async function promptForRepo(reposList: string[], configDir: string): Promise<string> {
  const rl = createReadline();
  if (reposList.length > 0) {
    console.log('Which repository?');
    reposList.forEach((r, idx) => console.log(`  ${idx + 1}. ${r}`));
    console.log('  Or type a repo name (must exist under REPOS_ROOT).');
  }
  const answer = await question(rl, 'Repository name or number: ');
  rl.close();
  const n = parseInt(answer, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= reposList.length) {
    return reposList[n - 1];
  }
  return answer;
}

async function promptForPrIdOrUrl(): Promise<string> {
  const rl = createReadline();
  const answer = await question(
    rl,
    'PR ID or full Azure PR URL (e.g. 182370 or https://dev.azure.com/.../pullrequest/182370): '
  );
  rl.close();
  return answer;
}

async function promptForBaseHead(): Promise<{ base: string; head: string }> {
  const rl = createReadline();
  const base = await question(rl, 'Base branch (e.g. main): ');
  const head = await question(rl, 'Head branch (PR branch): ');
  rl.close();
  return { base: base || 'main', head: head || '' };
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const configDir = getConfigDir();

  if (process.argv.includes('--version')) {
    loadEnv(configDir);
    console.log(getLogo());
    console.log('');
    console.log('v' + getVersion(configDir));
    process.exit(0);
  }

  if (process.argv.includes('--status')) {
    await printStatus();
    process.exit(0);
  }

  loadEnv(configDir);

  const reposRoot = getReposRoot();
  const reposList = loadReposList(configDir);
  let args = parseArgs(process.argv.slice(2));

  if (!args.prIdOrUrl && args.base === undefined && args.head === undefined && isAzureConfigured()) {
    const prInput = await promptForPrIdOrUrl();
    if (prInput) args = { ...args, prIdOrUrl: prInput };
  }
  if (!args.prIdOrUrl && args.base === undefined && args.head === undefined) {
    const { base, head } = await promptForBaseHead();
    args = { ...args, base, head };
  }

  let repoPath: string;
  let baseBranch: string;
  let headBranch: string;
  let prId: number | undefined;
  let repoName: string;
  const outputDir: string | undefined = args.outputDir;

  if (args.prIdOrUrl) {
    const parsed = parsePrUrl(args.prIdOrUrl);
    let details: PrDetails;
    if (parsed) {
      details = await getPrDetails(parsed.prId, `https://dev.azure.com/${parsed.org}`, parsed.project);
      repoName = parsed.repository;
    } else {
      if (!isAzureConfigured()) {
        console.error('Azure mode requires AZURE_ORG_URL, AZURE_PROJECT, AZURE_PAT in .env');
        process.exit(1);
      }
      details = await getPrDetails(args.prIdOrUrl);
      repoName = details.repository;
    }
    prId = details.pullRequestId;
    baseBranch = details.targetBranch;
    headBranch = details.sourceBranch;
    repoPath = path.join(reposRoot, repoName);
    if (!fs.existsSync(repoPath)) {
      console.error(`Repo not found at ${repoPath}. Check REPOS_ROOT and repo name.`);
      process.exit(1);
    }
  } else {
    if (args.base !== undefined && args.head !== undefined) {
      baseBranch = args.base;
      headBranch = args.head;
    } else {
      const prompted = await promptForBaseHead();
      baseBranch = prompted.base;
      headBranch = prompted.head;
    }
    if (!headBranch) {
      console.error('Head branch is required.');
      process.exit(1);
    }
    if (args.repo) {
      repoPath = path.isAbsolute(args.repo) ? args.repo : path.join(reposRoot, args.repo);
      repoName = path.basename(repoPath);
    } else if (outputDir) {
      repoName = await promptForRepo(reposList, configDir);
      if (!repoName) {
        console.error('Repository name is required when using --output-dir.');
        process.exit(1);
      }
      repoPath = path.join(reposRoot, repoName);
    } else {
      try {
        repoPath = getRepoRoot();
        repoName = path.basename(repoPath);
      } catch {
        repoName = await promptForRepo(reposList, configDir);
        if (!repoName) {
          console.error('Could not detect repo. Pass --repo or run from a git repo.');
          process.exit(1);
        }
        repoPath = path.join(reposRoot, repoName);
      }
    }
    if (!fs.existsSync(repoPath)) {
      console.error(`Repo not found at ${repoPath}.`);
      process.exit(1);
    }
  }

  const diffFileName = prId
    ? `.${prId}.codehermit-diff.txt`
    : outputDir
      ? `.${sanitizeBranchForFile(baseBranch)}_${sanitizeBranchForFile(headBranch)}.codehermit-diff.txt`
      : DIFF_FILE_BASE;
  const outputFileName = prId
    ? `.${prId}.codehermit-output.md`
    : outputDir
      ? `.${sanitizeBranchForFile(baseBranch)}_${sanitizeBranchForFile(headBranch)}.codehermit-output.md`
      : OUTPUT_FILE_BASE;

  let cwd: string;
  let diffWritePath: string | undefined;
  let reviewOutputPath: string;

  if (outputDir) {
    const outSubdir = path.resolve(process.cwd(), outputDir);
    const repoSubdir = path.join(outSubdir, repoName);
    cwd = repoSubdir;
    diffWritePath = path.join(repoSubdir, diffFileName);
    reviewOutputPath = path.join(repoSubdir, outputFileName);
  } else {
    cwd = repoPath;
    reviewOutputPath = path.join(repoPath, outputFileName);
  }

  console.log(`Reviewing PR: ${baseBranch}...${headBranch} (repo: ${repoName})${prId ? ` PR #${prId}` : ''}\n`);

  getDiff({
    repoRoot: repoPath,
    baseBranch,
    headBranch,
    diffFileName,
    writePath: diffWritePath,
  });

  runReview({
    cwd,
    diffFileName,
    outputPath: reviewOutputPath,
    configDir,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

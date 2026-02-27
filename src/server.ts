/**
 * CodeHermit HTTP API server.
 * Exposes REST endpoints for PR review and generic agent runs.
 */

import { spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { getConfigDir, getReposRoot } from './config';
import { loadEnv, runReviewAsync, runAgent, getAgentSpawnOptions } from './review';
import { getDiff } from './get-diff';
import { resolveReviewParams } from './lib/review-params';

const DEFAULT_PORT = 3947;
const DEFAULT_HOST = '0.0.0.0';

function getVersion(): string {
  try {
    const configDir = getConfigDir();
    const pkgPath = path.join(configDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function checkAgentInstalled(): Promise<boolean> {
  const { command: agentCmd, args: agentBaseArgs } = getAgentSpawnOptions();
  return new Promise<boolean>((resolve) => {
    const result = spawn(agentCmd, [...agentBaseArgs, '--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    result.on('error', () => resolve(false));
    result.on('close', (code: number | null) => resolve(code === 0));
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function sendJson(res: http.ServerResponse, status: number, body: object): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data, 'utf-8'),
  });
  res.end(data);
}

function sendError(res: http.ServerResponse, status: number, error: string, origin: string): void {
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  res.writeHead(status, headers);
  res.end(JSON.stringify({ ok: false, error }));
}

function sendSuccess(res: http.ServerResponse, body: object, origin: string): void {
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };
  const data = JSON.stringify(body);
  res.writeHead(200, {
    ...headers,
    'Content-Length': Buffer.byteLength(data, 'utf-8'),
  });
  res.end(data);
}

async function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export async function startServer(): Promise<void> {
  const configDir = getConfigDir();
  loadEnv(configDir);

  const port = parseInt(process.env.CODEHERMIT_PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.CODEHERMIT_HOST ?? DEFAULT_HOST;
  const corsOrigin = process.env.CODEHERMIT_CORS_ORIGIN ?? '*';

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin ?? corsOrigin;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...corsHeaders(origin),
        'Content-Length': '0',
      });
      res.end();
      return;
    }

    const url = req.url ?? '/';
    const pathname = url.split('?')[0];

    if (pathname === '/health' && req.method === 'GET') {
      const agentInstalled = await checkAgentInstalled();
      sendSuccess(res, { status: 'ok', version: getVersion(), agentInstalled }, origin);
      return;
    }

    if (pathname === '/review-pr' && req.method === 'POST') {
      try {
        const body = (await parseJsonBody(req)) as {
          prIdOrUrl?: string;
          baseBranch?: string;
          headBranch?: string;
          repo?: string;
          outputDir?: string;
        };
        const { prIdOrUrl, baseBranch, headBranch, repo, outputDir } = body;

        const hasPr = !!prIdOrUrl;
        const hasBaseHead = baseBranch !== undefined && headBranch !== undefined;
        if (hasPr === hasBaseHead) {
          sendError(res, 400, 'Exactly one of prIdOrUrl or (baseBranch + headBranch) must be provided', origin);
          return;
        }

        const reposRoot = getReposRoot();
        const params = await resolveReviewParams(
          { prIdOrUrl, baseBranch, headBranch, repo, outputDir },
          reposRoot
        );

        if (params.diffWritePath) {
          fs.mkdirSync(path.dirname(params.diffWritePath), { recursive: true });
        }

        getDiff({
          repoRoot: params.repoPath,
          baseBranch: params.baseBranch,
          headBranch: params.headBranch,
          diffFileName: params.diffFileName,
          writePath: params.diffWritePath,
        });

        const result = await runReviewAsync({
          cwd: params.cwd,
          diffFileName: params.diffFileName,
          outputPath: params.reviewOutputPath,
          configDir,
        });

        sendSuccess(
          res,
          {
            ok: true,
            output: result.output,
            repoPath: params.repoPath,
            baseBranch: params.baseBranch,
            headBranch: params.headBranch,
            prId: params.prId,
          },
          origin
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = msg.includes('required') || msg.includes('not found') ? 400 : 500;
        sendError(res, status, msg, origin);
      }
      return;
    }

    if (pathname === '/run' && req.method === 'POST') {
      try {
        const body = (await parseJsonBody(req)) as { repoPath?: string; prompt?: string };
        const { repoPath, prompt } = body;

        if (!repoPath || typeof repoPath !== 'string') {
          sendError(res, 400, 'repoPath is required', origin);
          return;
        }
        if (!prompt || typeof prompt !== 'string') {
          sendError(res, 400, 'prompt is required', origin);
          return;
        }

        if (!fs.existsSync(repoPath)) {
          sendError(res, 400, 'Repository path does not exist', origin);
          return;
        }
        if (!fs.statSync(repoPath).isDirectory()) {
          sendError(res, 400, 'Repository path must be a directory', origin);
          return;
        }

        const result = await runAgent({ cwd: repoPath, prompt });
        sendSuccess(res, { ok: true, output: result.output }, origin);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendError(res, 500, msg, origin);
      }
      return;
    }

    sendError(res, 404, 'Not found', origin);
  });

  server.listen(port, host, () => {
    console.log(`CodeHermit API server listening on http://${host}:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

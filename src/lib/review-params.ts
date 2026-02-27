/**
 * Shared logic for resolving PR review parameters.
 * Used by both CLI and API server.
 */

import * as path from 'path';
import * as fs from 'fs';
import { getPrDetails, parsePrUrl, isAzureConfigured, type PrDetails } from '../plugins/azure';
import { DIFF_FILE_BASE } from '../get-diff';

const OUTPUT_FILE_BASE = '.codehermit-output.md';

function sanitizeBranchForFile(branch: string): string {
  return branch.replace(/[/\\]/g, '_').replace(/\s/g, '_');
}

export interface ResolvedReviewParams {
  repoPath: string;
  baseBranch: string;
  headBranch: string;
  prId?: number;
  repoName: string;
  diffFileName: string;
  outputFileName: string;
  cwd: string;
  diffWritePath: string | undefined;
  reviewOutputPath: string;
}

export interface ReviewParamsInput {
  prIdOrUrl?: string;
  baseBranch?: string;
  headBranch?: string;
  repo?: string;
  outputDir?: string;
}

/**
 * Resolve review parameters from API/CLI input.
 * For prIdOrUrl mode: fetches from Azure, repo comes from Azure.
 * For base+head mode: repo is required (absolute path or name under reposRoot).
 * @throws Error if validation fails or repo not found
 */
export async function resolveReviewParams(
  input: ReviewParamsInput,
  reposRoot: string
): Promise<ResolvedReviewParams> {
  const { prIdOrUrl, baseBranch, headBranch, repo, outputDir } = input;
  let repoPath: string;
  let resolvedBase: string;
  let resolvedHead: string;
  let prId: number | undefined;
  let repoName: string;

  if (prIdOrUrl) {
    if (!isAzureConfigured()) {
      throw new Error('Azure mode requires AZURE_ORG_URL, AZURE_PROJECT, AZURE_PAT in .env');
    }
    const parsed = parsePrUrl(prIdOrUrl);
    let details: PrDetails;
    if (parsed) {
      details = await getPrDetails(parsed.prId, `https://dev.azure.com/${parsed.org}`, parsed.project);
      repoName = parsed.repository;
    } else {
      details = await getPrDetails(prIdOrUrl);
      repoName = details.repository;
    }
    prId = details.pullRequestId;
    resolvedBase = details.targetBranch;
    resolvedHead = details.sourceBranch;
    repoPath = path.join(reposRoot, repoName);
  } else {
    if (!baseBranch || !headBranch) {
      throw new Error('baseBranch and headBranch are required when not using prIdOrUrl');
    }
    if (!repo) {
      throw new Error('repo is required when using baseBranch and headBranch');
    }
    resolvedBase = baseBranch;
    resolvedHead = headBranch;
    repoPath = path.isAbsolute(repo) ? repo : path.join(reposRoot, repo);
    repoName = path.basename(repoPath);
  }

  if (!fs.existsSync(repoPath)) {
    throw new Error(`Repo not found at ${repoPath}`);
  }

  const diffFileName = prId
    ? `.${prId}.codehermit-diff.txt`
    : outputDir
      ? `.${sanitizeBranchForFile(resolvedBase)}_${sanitizeBranchForFile(resolvedHead)}.codehermit-diff.txt`
      : DIFF_FILE_BASE;
  const outputFileName = prId
    ? `.${prId}.codehermit-output.md`
    : outputDir
      ? `.${sanitizeBranchForFile(resolvedBase)}_${sanitizeBranchForFile(resolvedHead)}.codehermit-output.md`
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
    diffWritePath = undefined;
    reviewOutputPath = path.join(repoPath, outputFileName);
  }

  return {
    repoPath,
    baseBranch: resolvedBase,
    headBranch: resolvedHead,
    prId,
    repoName,
    diffFileName,
    outputFileName,
    cwd,
    diffWritePath,
    reviewOutputPath,
  };
}

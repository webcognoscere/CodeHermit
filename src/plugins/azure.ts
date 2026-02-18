/**
 * Optional Azure DevOps plugin: fetch PR details via REST API.
 * Uses AZURE_ORG_URL, AZURE_PROJECT, AZURE_PAT from env.
 */

export interface PrDetails {
  repository: string;
  sourceBranch: string;
  targetBranch: string;
  pullRequestId: number;
}

const REFS_HEADS = 'refs/heads/';

function stripRefsHeads(ref: string): string {
  if (ref.startsWith(REFS_HEADS)) return ref.slice(REFS_HEADS.length);
  return ref;
}

/**
 * Parse Azure DevOps PR URL to extract org, project, repo name, and PR ID.
 * Example: https://dev.azure.com/YourOrg/YourProject/_git/YourOrg.YourRepo/pullrequest/12345
 */
export function parsePrUrl(url: string): { org: string; project: string; repository: string; prId: string } | null {
  const trimmed = url.trim();
  if (!trimmed.includes('dev.azure.com') || !trimmed.includes('pullrequest')) return null;
  try {
    const u = new URL(trimmed);
    const pathParts = u.pathname.split('/').filter(Boolean);
    const pullRequestIdx = pathParts.indexOf('pullrequest');
    if (pullRequestIdx === -1 || pullRequestIdx >= pathParts.length - 1) return null;
    const prId = pathParts[pullRequestIdx + 1];
    const gitIdx = pathParts.indexOf('_git');
    if (gitIdx === -1 || gitIdx >= pathParts.length - 1) return null;
    const repository = pathParts[gitIdx + 1];
    if (pathParts.length < 2) return null;
    const org = pathParts[0];
    const project = pathParts[1];
    return { org, project, repository, prId };
  } catch {
    return null;
  }
}

export function isAzureConfigured(): boolean {
  const { orgUrl, project, pat } = getAzureConfig();
  return !!(orgUrl && project && pat);
}

/** Resolve org URL and project from either CodeHermit or mcp-server env var names. */
function getAzureConfig(): { orgUrl: string | undefined; project: string | undefined; pat: string | undefined } {
  const orgUrl = process.env.AZURE_ORG_URL;
  const orgName = process.env.AZURE_DEVOPS_ORG;
  const project = process.env.AZURE_PROJECT || process.env.AZURE_DEVOPS_PROJECT;
  const pat = process.env.AZURE_PAT || process.env.AZURE_DEVOPS_PAT;
  const resolvedOrgUrl = orgUrl || (orgName ? `https://dev.azure.com/${orgName}` : undefined);
  return { orgUrl: resolvedOrgUrl, project, pat };
}

/**
 * Fetch PR details from Azure DevOps (project-scoped Get Pull Request By Id).
 * When only prId is given, org and project come from env.
 */
export async function getPrDetails(
  prId: string,
  orgUrlOverride?: string,
  projectOverride?: string
): Promise<PrDetails> {
  const config = getAzureConfig();
  const org = orgUrlOverride ?? config.orgUrl;
  const proj = projectOverride ?? config.project;
  const pat = config.pat;
  if (!org || !proj || !pat) {
    throw new Error(
      'Missing Azure DevOps config. Set AZURE_ORG_URL (or AZURE_DEVOPS_ORG), AZURE_PROJECT (or AZURE_DEVOPS_PROJECT), and AZURE_PAT (or AZURE_DEVOPS_PAT) in .env.'
    );
  }
  const baseUrl = org.replace(/\/$/, '');
  const url = `${baseUrl}/${proj}/_apis/git/pullrequests/${prId}?api-version=7.0`;
  const patTrimmed = pat.trim();
  const auth = Buffer.from(`:${patTrimmed}`).toString('base64');
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        'Azure DevOps returned Unauthorized. Check that AZURE_PAT (or AZURE_DEVOPS_PAT) in .env is correct, not expired, and has at least Code (Read) scope. Create or renew a PAT at: https://dev.azure.com/_usersSettings/tokens'
      );
    }
    throw new Error(`Failed to fetch pull request: ${response.statusText}`);
  }
  const data = (await response.json()) as {
    pullRequestId: number;
    repository: { name: string };
    sourceRefName: string;
    targetRefName: string;
  };
  return {
    repository: data.repository.name,
    sourceBranch: stripRefsHeads(data.sourceRefName),
    targetBranch: stripRefsHeads(data.targetRefName),
    pullRequestId: data.pullRequestId,
  };
}

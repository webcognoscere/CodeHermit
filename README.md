<div align="center">

![CodeHermit Logo](src/img/Logo.png)

# CodeHermit

**Your friendly hermit crab with a magnifying glass—reviewing PRs so you don't have to.**

[![Node 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Cursor](https://img.shields.io/badge/Cursor-CLI-000?logo=cursor)](https://cursor.com)
[![Twitter](https://img.shields.io/badge/@webcognoscere-1DA1F2?logo=twitter&logoColor=white)](https://twitter.com/webcognoscere)

*Diff branches → Send to Cursor agent → Get a code review. That's it.*

</div>

---

## 🦀 What is this?

CodeHermit is a CLI that **reviews your pull requests** by diffing two branches and handing the result to the Cursor AI agent. No more copy-pasting diffs into chat. No more context switching. Just run a command and get feedback.

Works with **Azure DevOps** (PR ID or URL) or in **direct mode** (any base + head branch). Run it from anywhere—your repo, your desktop, your coffee shop. Or run **`codehermit serve`** to expose an HTTP API for tools like Halley.

```
       ___/~~~~~\___
      /  </>    \___
     |   o  o   |  ()
      \   ^    /   \
       \______/    \/

      CodeHermit
```

---

## ⚡ Quick start

```bash
# 1. Clone, install, build
npm install && npm run build

# 2. Link globally (run once)
npm link

# 3. Review a PR—that's it
codehermit 182370                    # Azure PR by ID
codehermit main feature/my-branch    # Direct: base + head
codehermit serve                     # Or start the API server (localhost:3947)
```

**First time?** Copy `.env.example` → `.env` and set `REPOS_ROOT` (e.g. `c:\code\repos`). For Azure mode, add `AZURE_ORG_URL`, `AZURE_PROJECT`, `AZURE_PAT`.

---

## 🔧 How it works

| Mode | What you give it | What it does |
|------|------------------|--------------|
| **Azure** | PR ID (`182370`) or full PR URL | Fetches repo + branches from Azure DevOps API, finds your local clone via `REPOS_ROOT`, runs diff + review |
| **Direct** | Base + head branch (e.g. `main feature/xyz`) | Diffs those branches, runs review. Optionally `--repo` or `--output-dir` |

The diff is written to a file, the Cursor `agent` CLI is invoked with your custom prompt, and the review lands in a markdown file (and your terminal). Config lives in the **CodeHermit package directory**—never inferred from your current folder.

---

## 📋 Prerequisites

- **Node.js 18+**
- **Cursor CLI** — `agent` must work in your terminal
  - **Windows:** `irm 'https://cursor.com/install?win32=true' | iex`
  - **macOS/Linux:** `curl https://cursor.com/install -fsS | bash`
- **Auth:** Run `agent login` once, or set `CURSOR_API_KEY` in `.env` ([get one](https://cursor.com/settings))

*Agent not found?* Set `AGENT_PATH` in `.env` to the full path of the `agent` executable.

---

## 📖 Usage

### Azure mode (PR ID or URL)

Requires `AZURE_ORG_URL`, `AZURE_PROJECT`, `AZURE_PAT` in `.env`.

```bash
codehermit 182370
codehermit --pr 182370
codehermit "https://dev.azure.com/Org/Project/_git/Repo/pullrequest/12345"
```

Local path = `REPOS_ROOT` + repo name (e.g. `c:\code\repos\YourOrg.YourRepo`).

### Direct mode (base + head)

```bash
codehermit                              # Interactive: prompts for base/head
codehermit main feature/my-pr            # Current branch vs main
codehermit --base main --head feature/xyz
codehermit main feature/xyz --repo c:\code\repos\MyRepo
```

With `--output-dir`, you're running from elsewhere (e.g. a "Pull Request Reviews" folder)—CodeHermit will **prompt** for which repo from `repos.json`. Copy `repos.json.example` → `repos.json` and edit the repo list.

### Save reviews outside the repo

```bash
codehermit 182370 --output-dir "c:\Code\Pull Request Reviews"
codehermit main feature/xyz -o "./Reviews"
```

Files go to `<output-dir>/<repo-name>/`. With a PR ID, filenames include it: `.182370.codehermit-diff.txt`, `.182370.codehermit-output.md`.

---

## 📁 Output files

| Location | With PR ID | Without PR ID |
|----------|------------|---------------|
| **In repo** | `.{PR_ID}.codehermit-diff.txt` / `.{PR_ID}.codehermit-output.md` | `.codehermit-diff.txt` / `.codehermit-output.md` |
| **With `--output-dir`** | Same, under `<output-dir>/<repo-name>/` | Same, with branch slug in filename |

All are in `.gitignore` (including `.*.codehermit-*`).

---

## ⚙️ Config

| File | Purpose |
|------|---------|
| **`.env`** | `REPOS_ROOT`, `CURSOR_API_KEY`, `AGENT_PATH`, and optionally `AZURE_ORG_URL`, `AZURE_PROJECT`, `AZURE_PAT` |
| **`repos.json`** | List of repo names for the "Which repository?" prompt. Copy from `repos.json.example`. |
| **`prompt.md`** | The review instructions sent to the agent. Customize to your heart's content. |

> ⚠️ **Never commit** `.env`, `repos.json`, or PATs. These contain secrets and are listed in `.gitignore`—keep them that way.

---

## 🛠️ Commands

| Command | What it does |
|---------|--------------|
| `codehermit --help` | Usage, options, examples |
| `codehermit --version` | Version + logo |
| `codehermit --status` | Agent installed? Auth? Azure config? Config dir? |
| `codehermit serve` | Start the API server (see [Server mode](#-server-mode) below) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` / `npm run review` | Run the CLI |
| `npm run serve` | Start the API server directly |
| `npm run diff` | Diff only (`node dist/get-diff.js [base] [head]`) |

---

## 🌐 Server mode

CodeHermit can run as an HTTP API server so tools like Halley can invoke CodeHermit's AI/agent operations over HTTP instead of spawning the CLI.

### Start the server

```bash
codehermit serve
# Server listening on http://0.0.0.0:3947
```

**Port and host:** Set `CODEHERMIT_PORT` (default `3947`) and `CODEHERMIT_HOST` (default `0.0.0.0`) to customize.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Liveness check. Returns `{ status: "ok", version, agentInstalled }` |
| `POST` | `/review-pr` | PR code review (same as CLI). Body: `{ prIdOrUrl }` or `{ baseBranch, headBranch, repo, outputDir? }` |
| `POST` | `/run` | Generic agent run with custom prompt. Body: `{ repoPath, prompt }` |

### Example requests

```bash
# Health check
curl http://localhost:3947/health

# PR review (Azure mode)
curl -X POST http://localhost:3947/review-pr -H "Content-Type: application/json" \
  -d '{"prIdOrUrl": "182370"}'

# PR review (direct mode)
curl -X POST http://localhost:3947/review-pr -H "Content-Type: application/json" \
  -d '{"baseBranch": "main", "headBranch": "feature/xyz", "repo": "Org.RepoName"}'

# Generic agent run
curl -X POST http://localhost:3947/run -H "Content-Type: application/json" \
  -d '{"repoPath": "c:\\code\\repos\\MyRepo", "prompt": "Scan this repo for issues."}'
```

**CORS:** By default `Access-Control-Allow-Origin: *`. Set `CODEHERMIT_CORS_ORIGIN` to restrict origins.

---

## 🔗 Linking & rebuilding

- **`npm link`** — Run once. Puts `codehermit` on your PATH. Re-run only if you `npm unlink codehermit` or change global npm.
- **`npm run build`** — Run after code changes. The link points here, so `codehermit` always runs the latest build.

---

## 🚧 About this project

**Work in progress.** I built CodeHermit to help me at work—I use Cursor daily, but we don't have Azure DevOps integration for automated pull request reviews yet. With limited options to automate, this is my temporary solution to stay on top of many PRs across different repos.

Ideas, feedback, and contributions are welcome. If you've solved similar problems or have suggestions, I'd love to hear them.

**Changelog:** See [CHANGELOG.md](CHANGELOG.md) for version history and recent changes.

---

<div align="center">

*Built with 🦀 and a magnifying glass by [@webcognoscere](https://twitter.com/webcognoscere)*

</div>

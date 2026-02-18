# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-02-17

### Added

- **`--help`** – Show usage, options, and examples.
- **`--version`** – Print version from package.json and exit.
- **`--status`** – Report whether the Cursor agent is installed (and its version), whether auth is configured (CURSOR_API_KEY), and whether Azure credentials are loaded (AZURE_ORG_URL, AZURE_PROJECT, AZURE_PAT). Also prints config directory.

## [1.0.0] - 2025-02-17

### Added

- TypeScript CLI invokable from any directory (`codehermit` or `node dist/cli.js`).
- **Azure mode**: Pass a PR ID or full Azure DevOps PR URL; tool fetches repo and branches via REST API, resolves local path from REPOS_ROOT.
- **Direct mode**: Pass base and head branch (and optional repo); supports running from inside a repo or with `--repo` / `--output-dir`.
- **`--output-dir`**: Write diff and review files to a dedicated folder (e.g. `Pull Request Reviews/<repo-name>/`) instead of the repo root.
- **PR ID in filenames**: When a PR ID is available, diff and review files are named `.<PR_ID>.codehermit-diff.txt` and `.<PR_ID>.codehermit-output.md`.
- **repos.json**: JSON array of repo names for the “Which repository?” prompt when using `--output-dir` in direct mode. Copy `repos.json.example` to `repos.json`.
- Config (`.env`, `prompt.md`, `repos.json`) loaded from package directory; never inferred from current working directory.
- README with linking/rebuilding notes and full usage.

[1.1.0]: https://github.com/your-org/personal-assistant/compare/codehermit-v1.0.0...codehermit-v1.1.0
[1.0.0]: https://github.com/your-org/personal-assistant/releases/tag/codehermit-v1.0.0

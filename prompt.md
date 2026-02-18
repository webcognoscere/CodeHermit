Review the pull request diff in the file .codehermit-diff.txt (in the root of this workspace). Read that file and output a code review in the following structure.

**1. Summary**
Start with a short summary of what the PR does: the behaviour or intended behaviour, and how the changes support it. Keep this at the top so the reader gets context first.

**2. Per-file feedback**
Organise all feedback by file. For each file that has changes worth commenting on, use this structure:

## `path/to/file.ext`

For each finding in that file, give two versions:

- **Technical:** Brief description and concrete issues (correctness, security, performance, readability, tests, consistency). Use clear, precise language.
- **Developer comment:** The same feedback rewritten in a human, conversational tone—something you could paste directly to the developer (e.g. in a PR comment or Slack). Friendly and constructive, same content but less formal.

If a file has no issues, you can skip it or add a single line like "No issues."

Consider: correctness and bugs, security, performance, readability, tests, edge cases, consistency with the codebase. Use severity where it helps (Critical / Suggestion / Nitpick). Output valid markdown.

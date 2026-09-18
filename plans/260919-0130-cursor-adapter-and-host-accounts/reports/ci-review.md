# CI review — first GitHub Actions runs failed on both runners

Reviewer: Claude · Runs: 35378442301, 35383334755 (main) · Verdict: two independent MUST fixes.

## MUST-1 — Windows: CI uses pnpm 9, which tries to compile better-sqlite3

Log (windows-latest, "Install dependencies"):

```
.../better-sqlite3 install$ node-gyp rebuild        ← pnpm@9.15.9's bundled node-gyp
gyp ERR! find VS could not find a version of Visual Studio 2017 or newer to use
```

`better-sqlite3@13.0.3` has no `install` script, `gypfile: false`, and ships
N-API prebuilds; pnpm 9 still runs `node-gyp rebuild` because the package
contains a `binding.gyp`, and it ignores the `allowBuilds` section of
`pnpm-workspace.yaml` (pnpm 10+ syntax). The dev host uses pnpm 11.22.0, where
install works without a compiler.

Fix:
- Add `"packageManager": "pnpm@11.22.0"` to the root `package.json`.
- In `.github/workflows/ci.yml`, use `pnpm/action-setup@v4` **without** a
  `version` input so it reads `packageManager`; keep `actions/setup-node@v4`
  with `node-version: 22` and `cache: pnpm`.
- Keep `pnpm install --frozen-lockfile`.

## MUST-2 — Ubuntu: `parseCmdShim` builds Windows paths with POSIX `path.resolve`

Log (ubuntu-latest, "Test"):

```
× parseCmdShim > resolves npm claude.cmd shim to claude.exe   → expected null to deeply equal {…}
× parseCmdShim > returns node execPath with js target as prefixArgs → expected undefined to be '/opt/hostedtoolcache/node/…'
```

The shim text contains `%dp0%\node_modules\@anthropic-ai\claude-code\bin\claude.exe`.
On Linux `\` is not a separator, so the resolved target does not exist and the
parser returns `null`. The parser only matters on Windows, but the unit tests
must pass on every platform.

Fix in `runner/resolve-executable.ts`: after stripping `%dp0%` / `%SCRIPT_DIR%`,
split the remainder on `/[\\/]+/` and `join(dirname(cmdPath), ...parts)`. Same
for the `.ps1` target. No behaviour change on Windows.

## Also

- The Ubuntu run skipped one test (the Windows-only `.exe` preference); fine.
- After the fix, confirm both matrix jobs are green: `gh run watch` or
  `gh run list --limit 1`.

## Instructions

1. Apply MUST-1 and MUST-2. `pnpm lint`, `pnpm test` green locally.
2. Commit as `fix(ci): pin pnpm 11 via packageManager and make cmd shim parsing portable`.
3. Do not push; the reviewer pushes and watches CI.

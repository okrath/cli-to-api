# Implementation Completion: Dynamic CLI Discovery, Host Terminal & Universal Extensibility

- **Date:** 2026-09-16
- **Status:** Complete & Verified
- **Monorepo Build:** 2/2 packages built cleanly (`@cli-to-api/gateway`, `@cli-to-api/web`)
- **Automated Test Suite:** 15 test files passed (56/56 tests passing, 100%)

## Key Milestones Delivered
1. **Zero-Phantom Account & Sandbox Invariant:**
   - Default accounts (`*-acc-01`) and filesystem directories are provisioned strictly for verified installed CLIs.
   - Legacy phantom accounts with 0 requests are purged automatically on boot; accounts with request history are quarantined safely.
2. **Dual-Plane WebShell (Host Server Terminal vs. Account Sandbox):**
   - Implemented `POST /api/terminal/ticket` with single-use 30s TTL nonce-burn authentication.
   - Protected against Cross-Site WebSocket Hijacking (CSWSH) via strict Origin validation and loopback enforcement.
   - Elevated Amber Host Server Terminal running in `projectRoot` with native environment for running `npm i -g`, `cargo install`, `scoop install`, etc.
   - Contained Indigo Account Sandbox Jail running in `data/sandboxes/{adapter}/{account}` with isolated `$HOME` and scrubbed credentials for OAuth logins.
3. **Dynamic Registry-Aware PATH Probing & Hot Reload:**
   - Enhanced `resolveBinary()` with dynamic Windows Registry inspection (`reg query "HKCU\Environment" /v Path`) and global package manager directories (`npm`, `pnpm`, `cargo`, `scoop`, `winget`).
   - `POST /api/adapters/scan` re-evaluates binary presence and updates `/v1/models` without daemon restart.
   - Bounded version prober (`probeExecutable()`) terminates within $\le 1.5\text{s}$ under Win32 Job Object containment.
4. **Universal AI CLI Recipes & Manual Studio Modal:**
   - Pre-bundled production recipes for `omp-cli.yaml` (pipe) and `devin-cli.yaml` (pty).
   - Dual-directory loading: `./adapters/*.yaml` + `$DATA_DIR/adapters/*.yaml`.
   - `CustomAdapterStudioModal.tsx`: Monospace YAML editor, Archetype presets (Piped Subcommand, Interactive PTY), live dry-run probe (`POST /api/adapters/probe`), and 1-click registration.
5. **AK UI/UX Pro Max Cyber-Deck Experience:**
   - `AccountsView.tsx`: Dual-tab Fleet View (Active Accounts vs Available Catalog with 1-click install copy snippets).
   - High-contrast geometric Status Badges (`READY`, `INSTALLED`, `NOT_INSTALLED`, `DEGRADED`, `COOLDOWN`).
   - Clean elimination of phantom account cards.

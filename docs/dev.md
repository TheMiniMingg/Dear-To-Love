# Developing Dear to Love

## Prerequisites

- Node 22 (see `.nvmrc`) and pnpm 10 (`corepack enable`)
- Rust 1.97 (pinned in `src-tauri/rust-toolchain.toml`; rustup installs it)
- Tauri system dependencies: https://tauri.app/start/prerequisites/
  - Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libsecret-1-dev`

## Common commands

| Task                | Command                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Install             | `pnpm install`                                                                                 |
| Run the desktop app | `pnpm tauri dev`                                                                               |
| Frontend checks     | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`                                |
| Rust checks         | `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` |
| Regenerate TS types | `cd src-tauri && cargo test` (writes `src/types/generated/`)                                   |
| Development package | `pnpm tauri build --debug --bundles deb`                                                       |

## Layout

- `src/` React + TypeScript UI. `src/api/commands.ts` is the only place that calls Tauri.
- `src-tauri/src/` Rust core: `commands/` (Tauri entry points), `domain/` (types),
  `services/` (logic), `errors.rs` (typed error codes).
- `docs/roadmap-v4.md` is the spec; `docs/roadmap-decisions.md` records agreed changes.

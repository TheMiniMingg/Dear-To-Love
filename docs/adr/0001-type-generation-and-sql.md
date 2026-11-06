# ADR 0001: Generated DTOs and runtime-checked SQL

**Status:** accepted (2026-11-06)

## Type generation

Rust structs that cross the Tauri boundary derive `ts_rs::TS` with
`#[ts(export)]`. Running `cargo test` writes them to `src/types/generated/`
(configured in `src-tauri/.cargo/config.toml`). CI fails if the committed files
differ from what `cargo test` produces, so the two sides cannot drift.

Chosen over `tauri-specta` because `ts-rs` is stable and does not need to own
command registration. Command wrappers in `src/api/commands.ts` are written by
hand but only use generated types.

Rules: serde attributes drive the TS shape; avoid `u64`/`i64` in DTOs (they
become `bigint`), use `u32`/`i32` or `f64`.

## SQL

We use SQLx's runtime-checked `query`/`query_as` functions, not the
compile-time `query!` macros. The macros need either a live database or a
committed `.sqlx` cache at build time, which complicates CI and contributor
setup. Integration tests against temporary databases cover query correctness
instead.

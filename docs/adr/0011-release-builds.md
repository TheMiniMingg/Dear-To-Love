# ADR 0011: Release builds and the installer smoke test

Status: accepted (PR 13)

## Context

M10 asks for releasable Windows, macOS and Linux artifacts, signing and
notarization "as applicable", and installer smoke tests: T48 (a tag that
doesn't match the packaged version fails the release job) and T49
(install, upgrade and launch on each system keep the story database, and a
first-run and restore test passes). The Linux E2E suite drives the app
through WebDriver, but macOS has no WebDriver for its web view and
installed packages can't be driven that way on every runner.

## Decision

- **One workflow, three jobs.** A `vX.Y.Z` tag builds on Ubuntu 22.04
  (`.deb`, `.rpm`, `.AppImage`; the older glibc runs on newer systems),
  Windows (NSIS and MSI) and macOS (one universal `.dmg`). Each package is
  then installed and started on a clean runner (Ubuntu 24.04, Windows,
  macOS). Only when every smoke test passes is a **draft** release created,
  with `SHA256SUMS.txt` and notes from the CHANGELOG. A maintainer publishes
  it; the app's update check never sees drafts.
- **Version gate (T48).** `tauri.conf.json` is the source of truth;
  `package.json`, `Cargo.toml` and `Cargo.lock` must match it on every CI
  run, and a tag must be exactly `v` + that version. `pnpm set-version`
  changes all four. A tag also needs a CHANGELOG section.
- **The app checks itself (T49).** Started with `--smoke-test <report>`, the
  packaged app runs its normal startup (data folder, migrations, contract
  checks, recovery), waits for the interface to call back, then adds a
  Quick Start story and a save (`--smoke-seed`), backs everything up to a
  temporary file and checks it the way Restore does, runs the standard
  Diagnostics, writes a JSON report and quits. If the interface doesn't
  load within 120 s it reports that instead. A Node script installs the
  package, starts it with the seed, installs it again over itself, starts it
  again and requires the story to still be there. This tests the real
  installed binary, its web view and its data folder on all three systems
  without a WebDriver.
- **The flag ships in releases.** It has to, since the release binaries are
  what is tested. It only acts when given explicitly with a report path,
  adds one clearly named story and save, and never changes or removes
  anything else; the backup it checks is deleted and the staged restore is
  cancelled.
- **Signing is optional.** macOS signing and notarization use Tauri's
  `APPLE_*` variables, and Windows signing imports a `.pfx` and passes its
  thumbprint, each only when the repository secrets exist. Without them,
  macOS builds are ad-hoc signed and the release notes explain how to open
  unsigned apps. Linux packages are not signed.
- **Upgrade from a previous release** is not tested yet: there is none, and
  the previous package must support `--smoke-test`. Reinstalling over an
  existing install with data stands in for it until 0.1.0 is out; database
  upgrades are covered by the migration fixtures.

## Consequences

- Releases need a CHANGELOG section and a matching version, so a forgotten
  bump fails before anything is built.
- Pull requests that change the release tooling build all three systems
  (slow, but only for those PRs).
- Until signing secrets are added, Windows SmartScreen and macOS
  Gatekeeper warn on first launch.

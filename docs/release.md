# Making a release

Releases are built by `.github/workflows/release.yml` when a `vX.Y.Z` tag is pushed. Nothing is
published automatically: the workflow ends with a **draft** release for a maintainer to read and
publish.

## Steps

1. On `main`, set the version everywhere it is recorded (`package.json`, `tauri.conf.json`,
   `Cargo.toml`, `Cargo.lock`, and the README's download links):

   ```sh
   pnpm set-version 0.2.0
   ```

2. In `CHANGELOG.md`, rename `## Unreleased` to `## 0.2.0` (a date may follow, e.g.
   `## [0.2.0] - 2026-12-01`) and start a new empty `## Unreleased` above it. The release notes
   are taken from this section; a tag without one fails.
3. Commit, open a pull request, and merge it once CI is green.
4. Tag the merge commit and push the tag:

   ```sh
   git tag v0.2.0 && git push origin v0.2.0
   ```

   Or, without a terminal: **Actions → Start a release → Run workflow**, and type the
   version (`0.2.0`). It checks the version, its CHANGELOG section and that the tag is new,
   tags main's latest commit and starts the Release workflow on that tag.

5. Watch the **Release** workflow. It:
   - fails at once if the tag isn't exactly `v` + the packaged version (T48), or the
     CHANGELOG has no section for it;
   - builds Linux (`.deb`, `.rpm`, `.AppImage`, on Ubuntu 22.04 for older glibc), Windows
     (NSIS `setup.exe` and `.msi`) and macOS (one universal `.dmg` for Apple silicon and Intel);
   - runs the installer smoke test on a clean machine for each system (below);
   - creates a draft release with every file (spaces in names become dots), `SHA256SUMS.txt`,
     `latest.json` when the build signed its updater files, and notes from the CHANGELOG
     section plus how to install.
6. Open the draft on GitHub, read it, and **Publish**. Only then does the app's update check
   (for users who turned it on) see the new version, and the README's download buttons work
   (they point at this version's files).

A pull request that changes the release tooling runs the same builds and smoke tests without
creating a release. **Run workflow** on the Actions tab does the same for any branch.

## Installer smoke test (T49)

`scripts/smoke/run.mjs` installs the package (`.deb` with apt, NSIS setup silently, `.dmg`
copied to Applications) and starts the installed app twice:

1. `--smoke-test <report> --smoke-seed`: a first run on an empty data folder. The app opens and
   migrates its database as usual, waits for the window to load the interface, adds a Quick
   Start story and a save, backs everything up to a temporary file and checks that file the way
   **Restore** does (without restoring), runs the standard Diagnostics, writes a JSON report and
   quits.
2. The same package is installed again over the first, and the app is started with
   `--smoke-test <report>`. The story and its save must still be there.

A run passes when the interface loaded, the version and database schema are the expected ones,
`APP_VERSION`, `DATA_DIR`, `DATABASE`, `TIMELINE_REPLAY` and `USAGE_LEDGER` pass, no check fails
(CI machines have no AI connection or keyring, so those may warn or be skipped), the backup
holds every story, and the test story was kept (`scripts/smoke/report.mjs`).

To try it on Linux: `pnpm tauri build --bundles deb`, then
`node scripts/smoke/run.mjs --dir src-tauri/target/release/bundle --version 0.1.0`. It installs
the package system-wide (with sudo) but uses a temporary data folder.

Once a release exists, the next step is an upgrade from the previous published version: install
its package first, seed with it, then install the new one. That needs a previous release that
supports `--smoke-test`, so it starts with the release after 0.1.0.

## In-app updates

A release built with an update signing key lets the app install the next release itself
(**Settings → Updates → Install … and restart**): the build signs its updater files, and the
release gets a `latest.json` that the app reads from
`https://github.com/TheMiniMingg/Dear-To-Love/releases/latest/download/latest.json`. The app
checks each download against the public key built into it before installing. Without the key
the app links to the release page, as before. Set it up once, before the first release that
testers install, because a copy can only update itself if it was built with the key:

1. On your own computer, run `pnpm tauri signer generate -w ~/.tauri/dear-to-love.key` and
   choose a password. Keep the `.key` file and the password somewhere safe (a password
   manager). If they are lost, installed copies can't take updates and everyone has to
   download the next version by hand once.
2. In the repository's Settings → Secrets and variables → Actions:
   - secret `TAURI_SIGNING_PRIVATE_KEY`: the contents of `dear-to-love.key`;
   - secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password;
   - variable (not a secret) `TAURI_UPDATER_PUBKEY`: the contents of `dear-to-love.key.pub`.

`latest.json` is attached to the draft release, and the app only sees it once the release is
published (drafts and prereleases are never "latest"). Copies installed from the Linux `.deb`
or `.rpm` ask for an administrator password to update.

## Signing

Without signing secrets the builds are unsigned (macOS builds are ad-hoc signed), and the
release notes say how to open them. Signing is used as soon as these repository secrets exist
(Settings → Secrets and variables → Actions):

| Secret                                        | What                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`                           | Base64 of the "Developer ID Application" certificate exported as `.p12` |
| `APPLE_CERTIFICATE_PASSWORD`                  | The `.p12` password                                                     |
| `APPLE_SIGNING_IDENTITY`                      | e.g. `Developer ID Application: Your Name (TEAMID)`                     |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Notarization: Apple ID, an app-specific password, and the team ID       |
| `WINDOWS_CERTIFICATE`                         | Base64 of a code-signing certificate exported as `.pfx`                 |
| `WINDOWS_CERTIFICATE_PASSWORD`                | The `.pfx` password                                                     |

macOS signing needs a paid Apple Developer account. Windows certificates issued since 2023 are
usually kept on a hardware token or a cloud service rather than exported as `.pfx`; with such a
certificate (e.g. Azure Trusted Signing), replace the "Windows signing" step with that
service's `signCommand` (see https://tauri.app/distribute/sign/windows/). Linux packages are not
signed; `SHA256SUMS.txt` lets people check their download.

The signing steps only run when the secrets exist, so they have not run in CI yet. Make the
first signed release a release candidate tag (e.g. `v0.2.0-rc.1`, after
`pnpm set-version 0.2.0-rc.1` and a `## 0.2.0-rc.1` CHANGELOG section) and check the
signatures before a final one. Such a release is marked as a prerelease, and the app's update
check ignores it.

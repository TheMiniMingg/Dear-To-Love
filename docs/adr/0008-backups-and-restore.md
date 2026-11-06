# ADR 0008: Backups and restore

Status: accepted (PR 10c)

## Context

Roadmap section 10 asks for a manual "export all", rotating automatic
backups after story changes (daily when used, five kept) taken with a
WAL-safe method, and a restore that is staged in a new location and checked
before anything is swapped (T35). Budget controls must never block a backup.
Whole-app backups may keep usage records, rates and budgets; API keys live
in the OS credential store and never leave it.

## Decision

- **Snapshots** always use `VACUUM INTO` on a reader connection: one
  consistent, compacted file that includes whatever is still in the WAL.
  The live `story.db` is never copied directly.
- **Automatic backups** (`backups/auto/auto-<UTC time>.db`). A background
  task checks a minute after start and then hourly. It writes a new copy
  only when the newest one is at least 24 hours old _and_ something changed
  since (the newest `updated_at`/`created_at` across stories, routes,
  events, saves and images). Writes go through a `.part` file and a rename.
  The newest five are kept. Images are not copied: library files are
  content-addressed and never change, and one is deleted only when no story
  uses it.
- **Back up everything** (`.dtlbackup`, format version 1). A ZIP holding
  `backup.json` (app version, schema version, counts, SHA-256 and size of
  every file), `story.db` (a snapshot, deflated) and every image's original
  and thumbnail under `assets/` (stored). The asset list comes from the
  snapshot, not the live database. The file is written through a temporary
  file and a rename.
- **Restore, step 1: prepare.** Nothing live changes. The source is a
  `.dtlbackup` file or a kept copy. It is unpacked into `restore/<token>/`
  under the same rules as storypacks: only expected names, byte-counted
  limits, an exact manifest match, and each original's name equal to its
  checksum. The copy is opened with the normal `Database::open`: an older
  schema is upgraded, a newer one is refused with "update the app". Then it
  must pass `PRAGMA quick_check` and the startup contract checks, and is
  written out again as one clean file (`ready.db`). The plan reports
  stories, routes, images, and pictures found in neither the backup nor
  this computer's library.
- **Restore, step 2: confirm.** The current data is saved as
  `backups/before-restore-<time>.db` (newest five kept), and a marker
  `restore.json` is written atomically. The app then restarts.
- **Restore, step 3: swap.** This runs at the next start, before the
  database opens, and each part can run again if interrupted. Image files
  are moved in first; adding content-addressed files is always safe. Then
  the old database's `-wal` and `-shm` files are removed, so the old log
  can't be applied to the restored file. Finally one rename puts
  `ready.db` in place, and the marker and staging folder are removed. A
  missing `ready.db` with the marker still present means the rename
  already happened. The outcome is written to `restore-result.json` and
  shown once in the library.
- **Diagnostics** gets a `BACKUPS` check. It passes when nothing needs a
  backup yet or the newest automatic backup is recent, and warns when there
  is none or it is over a week behind changes. The deep check also opens the
  newest automatic backup and runs `quick_check` on it.

## Consequences

- Restoring replaces everything: stories, image links, settings,
  connections and usage records. The "before restore" copy makes that
  reversible from the same screen.
- Restoring an automatic copy relies on the current image library. A
  picture deleted after that copy was made shows as missing, and the plan
  says so before confirming.
- On another computer, connections come back without their API keys, which
  are entered again in Settings.
- Removing the old WAL loses only what the "before restore" snapshot
  already holds, because that snapshot is taken at confirmation, just
  before the restart.

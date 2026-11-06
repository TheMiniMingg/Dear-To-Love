# ADR 0006: The local image library

Status: accepted (PR 10a)

## Context

Roadmap section 10 asks for a reusable local image library (PNG, JPEG, WebP
covers, backgrounds and portraits), content-addressed storage with
thumbnails, route-specific picture changes through `edit` events, and
deletion that never leaves a hidden broken reference (T30, T31, T40).
Storypacks and backups (PR 10b, 10c) will carry these files, so the storage
layout and slot names are interface contracts.

## Decision

- **Storage.** `<app data>/assets/originals/<sha256>.<png|jpg|webp>` and
  `assets/thumbs/<sha256>.<png|jpg>`. The `assets` table (migration 0003)
  keeps one row per SHA-256 with relative paths, MIME type, dimensions, byte
  size, a name and tags. The same bytes added twice return the existing row
  (T30); nothing about story links is shared.
- **Validation.** The format is detected from the bytes, never the file name.
  Only PNG, JPEG and WebP decode; SVG, GIF, HTML and anything else is refused.
  Files over 20 MB are refused before reading; images over 16384 px on a side
  or needing more than 512 MB to decode are refused by the decoder's limits.
  The whole image is decoded once, so damaged files fail at import.
  EXIF orientation is applied to the stored dimensions and the thumbnail.
- **Thumbnails** fit 320 × 320 and are never enlarged: JPEG (quality 85)
  for opaque images, PNG when the image has transparency.
- **Write order.** Each file goes to `assets/tmp/<id>.part`, is flushed, then
  renamed into place; the database row is added last. An interruption leaves
  at most an unused file (allowed by section 10), never a row without a file.
- **Display.** The webview loads images only through the `dtlimg:` protocol
  (`dtlimg://localhost/<thumb|full>/<asset id>` on Linux and macOS,
  `http://dtlimg.localhost/...` on Windows), which looks the id up in the
  database and serves the stored file with its MIME type and `nosniff`. No
  file path reaches the frontend, and the CSP allows only `dtlimg:` (plus
  `data:` and `blob:`) for images.
- **Slots.** `cover`, `background` and `portrait:<character id>`. A story
  default is an `asset_links` row (`story/cover`, `story/background`,
  `character/<id>/portrait`); a route's own choice is a `setVisualRef` edit
  event from that point on, and wins over the default on that route. The
  cover belongs to the whole story and cannot be set on one route. Edits that
  name an unknown slot, an image not in the library, or a portrait for a
  character not in the story at that point are refused.
- **Deletion.** An image can be deleted only when nothing shows it: no story
  default, no story's starting state, and no `setVisualRef` in any event of
  any route (hidden routes and events long before the head included). Events
  are immutable, so a picture used in a story's history stays until that
  story is deleted (T31). `asset_links.asset_id` has no `ON DELETE` action as
  a second guard. Files are removed after the row; a failed removal leaves a
  harmless orphan.
- **Diagnostics.** `ASSETS` checks that every original and thumbnail exists
  with the recorded size (the deep check also re-hashes originals) and that
  stories don't refer to images the library lacks. Problems are a warning
  listing image ids; stories still open and a missing picture shows as
  "Picture missing" (T40). Adding the same image again restores its file.

## Consequences

- Tags are free text with a few suggested kinds (Portrait, Background,
  Cover, Expression, Outfit); expressions and outfits are not separate slots
  yet.
- Storypack export (PR 10b) copies the originals of every image a story
  references and re-imports them through the same validation.

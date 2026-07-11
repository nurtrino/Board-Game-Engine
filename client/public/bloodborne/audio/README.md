# Bloodborne music

This directory starts silent by design. Audio is optional and the game remains fully playable when `manifest.json` or any track is unavailable.

Import only audio you created, own, or have permission to use. The importer accepts local audio files and direct publisher-hosted HTTP(S) audio-file URLs. It rejects YouTube/youtu.be, streaming-service pages, page-like URLs, non-audio responses, and entries without explicit license and source metadata. It does not bypass DRM or extract media from websites.

## Curated CC BY batch

The checked-in plan references music made available by the artist under CC BY 4.0. Review the source and license before importing, then run from the workspace root:

```powershell
node tools/audio/import-bloodborne-audio.mjs --config tools/audio/bloodborne-cc-by-plan.json
```

Use `--dry-run` to validate metadata without downloading or converting anything. Use `--replace` only when intentionally replacing existing ids.

The importer normalizes files to OGG (or MP3 when requested), removes video and metadata streams, validates the input and output with `ffprobe`, limits duration and file size, and writes `manifest.json` atomically. Each manifest entry records roles, loop/gain/crossfade behavior, duration, byte size, SHA-256, license, source, and attribution. `CREDITS.md` is regenerated from that manifest.

## Roles

- `menu`: setup and hunter selection
- `exploration`: ordinary play
- `enemy-encounter`: an active enemy fight
- `boss`: boss phase 1
- `boss-phase`: boss phase 2
- `dream`: Hunter's Dream and dream upgrades
- `victory` / `defeat`: terminal stingers

Tracks may serve more than one role. Optional `bossId`, `bossPhase`, and `enemyId` fields select a more specific track before a generic role track.

## Single-file import

```powershell
node tools/audio/import-bloodborne-audio.mjs --input C:\licensed-audio\explore.wav --id my-exploration --title "My Exploration" --role exploration --license "My licensed use" --source "Composer/source documentation" --attribution "Artist credit" --gain 0.5 --crossfade-ms 2500 --loop true
```

Do not hand-edit checksums or durations. Re-run the importer instead.

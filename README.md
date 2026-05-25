# Standup Tracker

A bookmarklet that adds a participant-tracking panel to Google Meet calls. Lists meeting participants, with planned per-speaker timer and tile overlays for follow-up releases.

## Quick start

See [INSTALL.md](INSTALL.md) for installation and usage instructions.

## Development

The source is a single IIFE at `lib/standup.js`. Build the bookmarklet:

```bash
bin/build
```

Output is written to `dist/bookmarklet.txt`. Requirements: `sed`, `tr`, `python3` (stock macOS).

Add `window.__STANDUP_DEBUG = true` before running the bookmarklet to expose `window.__standup` for debugging.

## Known limitations

- Self-tile detection only works in French and English (locale-limited).
- Background tabs throttle DOM updates — keep the Meet tab visible.
- Side-panel dock detection is best-effort and may break on Meet redesigns.
- Settings are in-memory only, discarded on each run.
- Build size is capped at 20 KB; exceeding this will break the build.

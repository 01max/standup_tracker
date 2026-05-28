# Standup Tracker

A bookmarklet that adds a participant-tracking panel to Google Meet calls with speaker detection, per-speaker round timer, and tile overlays.

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
- Background tabs throttle DOM updates — keep the Meet tab visible. The timer also freezes when the tab is hidden. A toast warns on tab return that speaker states may be outdated.
- Speaker detection relies on Meet-internal CSS class names (`.sxlEM` / `.BlxGDf`) which may break on redesign.
- Manual toggling of spoken state bypasses the contiguous-talk gate (intentional — it's a deliberate user override).
- Side-panel dock detection is best-effort and may break on Meet redesigns.
- Settings are in-memory only, discarded on each run.
- Build size is capped at 20 KB; exceeding this will break the build.

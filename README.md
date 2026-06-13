# Google Meet Standup Companion

This project contains a private, local bookmarklet for tracking who has spoken during a Google Meet standup.

## Files

- `standup-companion.js`: readable source for the bookmarklet.
- `standup-companion.bookmarklet.js`: generated bookmarklet URL payload.
- `test-harness.html`: local fake Meet page for quick behavior checks.
- `build-bookmarklet.mjs`: dependency-free generator for the bookmarklet payload.

## Install

Create a browser bookmark whose URL is the single line from `standup-companion.bookmarklet.js`.

## Behavior

- Adds compact standup controls to Google Meet's People panel after you open it.
- Waits for the real Google Meet People panel instead of modifying hover previews.
- Marks participants directly in visible People rows.
- Keeps talked/not-talked state in memory only.
- Allows manual check, uncheck, refresh, and reset.
- Auto-checks a participant after 3 continuous seconds of visible speaking state.
- Exposes `window.__meetStandupCompanionDebug.snapshot()` and `.logSnapshot()` for console diagnostics.
- Debug snapshots include `speakerCandidates`; call `.logSnapshot()` while someone is speaking to inspect why talk detection did or does not match.
- Debug snapshots include `panelCandidates`; call `.logSnapshot()` after opening People if the bookmarklet does not find the panel.
- Use `window.__meetStandupCompanionDebug.traceSpeaking(5000)` while someone talks to record DOM changes that may reveal Meet's speaking indicator.

Google Meet DOM details can change, so selector logic is intentionally isolated in `standup-companion.js`.

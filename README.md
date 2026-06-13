# standup_tracker

`standup_tracker` is a private, local bookmarklet for tracking who has spoken during a Google Meet standup.

> **Warning**
> `standup_tracker` depends on Google Meet's current page structure. Because Google can change Meet's DOM, labels, or speaking indicators at any time, this script can break or become outdated without notice. If the controls stop appearing or auto-detection becomes unreliable, check the debugging section and update the selectors in `standup-companion.js`.

It adds a compact "Standup" toolbar to the Google Meet People panel and a "Talked" checkbox beside each visible participant. The tracker keeps state in the current browser page only; it does not send data anywhere or persist attendance between meetings.

<img src="README/ui.png" alt="standup_tracker UI inside the Google Meet People panel" width="420">

## USAGE

1. Open a Google Meet call.
2. Open the People panel.
3. Run the `standup_tracker` bookmarklet.
4. Use the "Talked" checkbox beside each participant to mark who has spoken.
5. Watch the Standup count at the top of the People panel.
6. Use "Reset" to clear the current standup state.

When Google Meet exposes a visible speaking state, `standup_tracker` also marks a participant as talked after they have been detected speaking continuously for 3 seconds.

You can run the bookmarklet again in the same meeting to refresh and focus the existing controls.

## Install

Create a browser bookmark and paste the single line from `standup-companion.bookmarklet.js` into the bookmark URL field.

For the most reliable workflow:

1. Open `standup-companion.bookmarklet.js`.
2. Copy the full `javascript:` line.
3. Create or edit a browser bookmark.
4. Paste that line as the bookmark URL.
5. Name the bookmark `standup_tracker`.

## Local Development

The bookmarklet source lives in `standup-companion.js`. After editing it, rebuild the bookmarklet payload:

```sh
node build-bookmarklet.mjs
```

Use `test-harness.html` for a local fake Google Meet page that exercises the main People-panel and speaking-detection behavior.

## Files

- `standup-companion.js`: readable source for the bookmarklet.
- `standup-companion.bookmarklet.js`: generated bookmarklet URL payload.
- `build-bookmarklet.mjs`: dependency-free generator for the bookmarklet payload.
- `test-harness.html`: local fake Meet page for quick behavior checks.
- `README/ui.png`: screenshot of the controls in the Google Meet People panel.

## Behavior

- Adds controls only after the Google Meet People panel is available.
- Avoids modifying transient hover previews.
- Marks participants directly in visible People rows.
- Keeps talked/not-talked state in memory only.
- Supports manual check, uncheck, refresh by rerunning the bookmarklet, and reset.
- Auto-checks a participant after 3 continuous seconds of visible speaking state.

## Debugging

Google Meet DOM details can change. Selector logic is intentionally isolated in `standup-companion.js`, and the bookmarklet exposes a small console API for diagnostics:

```js
window.__meetStandupCompanionDebug.snapshot()
window.__meetStandupCompanionDebug.logSnapshot()
window.__meetStandupCompanionDebug.traceSpeaking(5000)
```

Use `logSnapshot()` after opening People if the bookmarklet does not find the panel. Use `traceSpeaking(5000)` while someone is talking to inspect the DOM changes Google Meet exposes for speaking state.

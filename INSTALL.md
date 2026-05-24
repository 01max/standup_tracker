# Install

## How to install

1. Open `dist/bookmarklet.txt` and copy its entire contents (select all + copy).
2. Create a new bookmark in your browser (any name, e.g. "Standup Tracker").
3. Paste the copied text into the URL field of the bookmark.
4. Save.

> **Browser refuses to save or truncates the URL?** The bookmarklet may have exceeded your browser's bookmark URL length limit. Rebuild from a smaller source or report it as a bug.

## How to use

1. Join a Google Meet call.
2. Click the "Standup Tracker" bookmark.
3. A panel appears on the right side with the participant list.
4. Click the bookmark again to remove the panel and stop scanning.

## Known limitations

- **FR/EN only:** Self-tile and presentation-tile detection relies on locale-specific labels (French and English). In other languages, your own tile may appear in the participant list.
- **Keep the Meet tab visible:** If the Meet tab is in the background, browser throttling may delay participant list updates.
- **Side-panel docking:** The standup panel tries to dock inside Meet's open side panel. If no side panel is open, it appears as a floating window. This detection is best-effort and may break when Google redesigns Meet.
- **No persistence:** Settings are reset each time you click the bookmark. This is a v1 limitation.

## How to remove

Delete the bookmark from your browser. That's all — the bookmarklet makes no permanent changes to your browser or Google account.

# Live Date (siyuan-live-date)

Keep the date in chosen documents "alive": open the note today and it shows today, tomorrow it shows tomorrow.
Only the rendering is changed — the stored markdown is untouched.

## Scope

A document is affected when either of these is true:

1. its document block carries the attribute `custom-live-date` (value `on`, or a date format such as
   `yyyy年MM月dd日`); or
2. it lives in a notebook listed in the plugin's notebook whitelist — a per-installation list, empty by default, so
   the document attribute is the portable way to enable a document.

To disable a document, set the attribute to `off` / `false` or remove it and reopen the document (the decision is
cached for 3 s when disabled / 60 s when enabled).

## Usage

### Inline markers (formatting is preserved)

- `@today` → `2026-09-26`
- `@now` → `2026-09-26 12:30:45`

For example `**【@today】**` renders as `【2026-09-26】` — bold and brackets are kept. The slash command `/dqr`
inserts `【@today】`.

### Block attribute

Give a block whose whole content is a date the attribute `custom-live-date`; the plugin refreshes its first text
node with the current date. Value empty or `on` → `yyyy-MM-dd`; custom formats are supported, e.g.
`yyyy年MM月dd日` or `yyyy-MM-dd HH:mm`.

Placeholders: `yyyy` `yy` `MM` `dd` `HH` `mm` `ss` `ECN` (weekday). Because the attribute lives in the block data,
a date that was persisted as plain text (for example when you edited and saved that line) is corrected on the next
render.

## Settings

<kbd>Settings</kbd> → <kbd>Marketplace</kbd> → <kbd>Downloaded</kbd> → Live Date (gear icon), or run the command
"Live Date: open settings" from the command palette.

- **Enabled notebooks** — the whitelist, one notebook ID per line (empty = the document attribute is the only way in)
- **Debug log** — off by default; when on, every actual replacement is written to
  `data/storage/petal/siyuan-live-date/debug.json`
- **Shortcut** — a button that fills in the notebook of the current document

## Boundaries

1. **Display only** — the file still contains `@today`. If you type in that line and save, SiYuan stores the
   currently displayed date as content and the marker is gone; type the marker again.
2. Code blocks, math blocks and HTML blocks are skipped, to avoid polluting data.
3. Not applied to PDF/image export, safe mode or a remote kernel (plugins are not loaded there).
4. Rendering happens on document load and 0.6 s after a change, so a freshly opened document may show `@today` for
   a moment.
5. Checking the document switch costs one `/api/attr/getBlockAttrs` call, cached for 3 s (not enabled) / 60 s
   (enabled).

## Troubleshooting

Turn on **Debug log** in the plugin settings to record every actual replacement in
`data/storage/petal/siyuan-live-date/debug.json` (at most 30 entries, flushed every 5 s):

```json
["2026-09-26T08:55:32.097Z onload",
 "2026-09-26T08:55:44.055Z render doc=20260926164351-yl4klgk markers=1 attrs=0"]
```

- only `onload` and no `render` → the document is out of scope, or no marker was found;
- `gate-error` → reading the attribute failed, and the plugin renders anyway;
- nothing is written while the debug log is off.

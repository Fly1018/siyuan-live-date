# Live Date (siyuan-live-date)

**Keep the date in chosen documents alive** — open the note today and it shows today, tomorrow it shows tomorrow. **Only the rendering changes; the stored data does not**, so the file still contains the marker you typed.

SiYuan v3.0.0+ · package `siyuan-live-date` · [repository](https://github.com/Fly1018/siyuan-live-date)

## What it does

- **Inline markers**: `@today` renders as today's date (`2026-09-26`), `@now` as the current time (`2026-09-26 12:30:45`)
- **Block attribute**: give a block the `custom-live-date` attribute and its date is refreshed in the format you specify
- **Two scopes**: per document via an attribute, or per notebook via a whitelist
- **Display only**: text nodes in the rendered page are replaced; the `@today` in the block data is untouched
- **Inline formatting preserved**: `**【@today】**` renders as `【2026-09-26】` — bold and brackets survive
- **Skips what it should not touch**: code blocks, math blocks, HTML blocks and any non-editable area

## When to use it

- A "today" line in daily/weekly note templates: a freshly created daily note shows the current date by itself
- Dashboards, checklists and habit pages that only need the current date or time
- Enabling it for **a few documents only** (document attribute) or for **a whole notebook** (whitelist)
- Custom date formats such as `2026年09月26日` or `2026-09-26 12:30`

## Install and enable

**Option 1 — from the marketplace (recommended)**

1. SiYuan → <kbd>Settings</kbd> → <kbd>Marketplace</kbd> → <kbd>Plugins</kbd>, search "Live Date"
2. Click install
3. Go to <kbd>Settings</kbd> → <kbd>Marketplace</kbd> → <kbd>Downloaded</kbd> and turn "Live Date" on

**Option 2 — manual install**

1. Download `package.zip` from the [latest release](https://github.com/Fly1018/siyuan-live-date/releases/latest)
2. <kbd>Settings</kbd> → <kbd>Marketplace</kbd> → <kbd>Downloaded</kbd> → install from `package.zip`
3. Enable it in the same list

**Choose the scope** (either one, or both):

- **A single document**: add the attribute `custom-live-date` to the **document block**, with an empty value or `on`
- **A whole notebook**: <kbd>Settings</kbd> → <kbd>Marketplace</kbd> → <kbd>Downloaded</kbd> → Live Date (gear icon) → fill the notebook IDs into "Enabled notebooks" (one per line), or click **"Add current document's notebook"**

Rendering happens when the document is opened — nothing else to do.

## Requirements

| Item | Requirement |
| --- | --- |
| SiYuan version | **v3.0.0 or later** (manifest `minAppVersion: 3.0.0`) |
| Backends / frontends | The manifest declares all of them (`backends: all`, `frontends: all`) |
| Dependencies | None. The plugin is a single `index.js` loaded directly by SiYuan — no Node/Python runtime |
| Network | No network access; it only calls the local kernel API |

> When exporting to PDF/image, in safe mode, or with a remote kernel, the plugin is not loaded at all, so dates are left as-is in those situations.

## Quick start

1. Open a document and add the attribute `custom-live-date` to the **document block**, with an empty value or `on`

2. Type a line in the body:

   ```
   Today: @today
   ```

3. Once the document has loaded it shows `Today: 2026-09-26`

4. Try the other two forms:

   - `@now` → `2026-09-26 12:30:45`
   - type the slash command `/dqr` (or `/live`) → inserts `【@today】`

5. To make a whole block show a date, give that block the `custom-live-date` attribute with a format as its value, e.g. `yyyy年MM月dd日`

If nothing changes, reopen the document once (the scope decision is cached — see "Known limits").

## Settings

<kbd>Settings</kbd> → <kbd>Marketplace</kbd> → <kbd>Downloaded</kbd> → Live Date (gear icon), or search
"Live Date: open settings" in the command palette.

| Setting | Meaning | Default |
| --- | --- | --- |
| **Enabled notebooks** | Notebook whitelist. Documents in these notebooks refresh their dates **without any attribute**. One notebook ID per line; commas or spaces also work. Empty means the document attribute is the only way in | **empty** |
| **Debug log** | Write every actual replacement into `data/storage/petal/siyuan-live-date/debug.json` (at most 30 entries, flushed every 5 s), for troubleshooting | **off** |
| **Shortcut** | The "Add current document's notebook" button, which appends the current document's notebook ID to the list above | — |

### Attributes and placeholders

**Document-block attribute `custom-live-date`** — decides whether this document is in scope: any value **other than** `off` / `false` / `0` (case-insensitive) means enabled. If the attribute is absent, set to one of those three values, or removed, the document is out of scope.

**Ordinary block attribute `custom-live-date`** — decides what date that block shows: the block's **first text node** is replaced entirely with the formatted date. An empty value or `on` uses the default format `yyyy-MM-dd`.

Supported format placeholders:

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `yyyy` | four-digit year | `2026` |
| `yy` | two-digit year | `26` |
| `MM` | two-digit month | `09` |
| `dd` | two-digit day | `26` |
| `HH` | two-digit hour (24-hour) | `12` |
| `mm` | two-digit minute | `30` |
| `ss` | two-digit second | `45` |
| `ECN` | weekday, always the Chinese form 日一二三四五六 | `六` |

If the value contains **any** placeholder it is formatted accordingly; if it contains none, the whole value falls back to the default `yyyy-MM-dd`.

**Inline markers `@today` / `@now`** — these two formats are **fixed and not configurable**: `@today` is `yyyy-MM-dd`, `@now` is `yyyy-MM-dd HH:mm:ss`.

## Advanced usage

### Custom date formats

Just combine placeholders in the `custom-live-date` block attribute:

| Attribute value | Rendered |
| --- | --- |
| (empty) or `on` | `2026-09-26` |
| `yyyy年MM月dd日` | `2026年09月26日` |
| `yyyy-MM-dd HH:mm` | `2026-09-26 12:30` |
| `yyyy/MM/dd（ECN）` | `2026/09/26（六）` |

### Slash command

Type `/dqr` or `/live` in the editor; pick the "Live Date `@today`" entry and it inserts `【@today】`.

### Turning it off

- **One document**: remove the `custom-live-date` attribute from the document block, or set it to `off` / `false`, then reopen the document
- **One notebook**: delete its ID in the settings and click OK (the cache is cleared immediately, no plugin reload needed)

## Known limits

1. **Display only** — the file still contains `@today`. But if you **type in that line and save**, SiYuan stores the currently displayed date as content and the marker is gone; type it again
2. **The block-attribute mode replaces the whole first text node**: if the block contains other text besides the date (e.g. `Today 2026-01-01`), that text is overwritten too. Use this attribute only on blocks whose entire content is the date
3. **Markers inside code blocks, math blocks and HTML blocks are not replaced**, to avoid polluting data
4. Not applied when exporting to PDF/image, in safe mode, or with a remote kernel (the plugin is not loaded there)
5. Rendering happens on document load and 0.6 s after a change, so a freshly opened document may show `@today` for a moment
6. Checking whether a document is in scope costs one `/api/attr/getBlockAttrs` call; the result is cached for **3 s (not enabled) / 60 s (enabled)**

## Troubleshooting

**The date does not change**

1. Make sure the document is in scope: the document block carries `custom-live-date` (not `off` / `false` / `0`), or its notebook is in the settings whitelist
2. Reopen the document, or wait for the cache to expire (3 s when not enabled / 60 s when enabled)
3. Turn on the **Debug log** and check `data/storage/petal/siyuan-live-date/debug.json`: if it only contains `onload` and no `render`, the document is out of scope or no marker was found
4. Make sure that line is not inside a code block, math block or HTML block

**`gate-error` in the debug log**

Reading the document attribute failed, and the plugin deliberately renders anyway. It is a fallback and does not affect normal use. If it happens often, check that SiYuan itself is healthy, or try another document.

**Why does `@today` still show for a moment after opening?**

Rendering runs after the document has loaded, and changes are debounced by 0.6 s, so the raw marker is visible for an instant. This is expected.

**The marker disappeared after I edited that line**

See "Known limits" item 2: when you type in that line and save, SiYuan stores the currently displayed date as content. Type `@today` again. To avoid it, do not edit directly on the line that gets replaced.

**Enable it for a few documents only, or for a whole notebook**

- A few documents → use the **document attribute** (it travels with the document, so it syncs and exports; recommended)
- A whole notebook → use the **notebook whitelist** (it holds notebook IDs, so it only applies to this device)

**How do I find a notebook ID?**

You do not have to: in the settings click **"Add current document's notebook"** and the ID of the current document's notebook is filled in for you.

## Development & release

**The repository root is the plugin itself** — SiYuan loads `index.js` directly
(CommonJS, `require("siyuan")`), so there is no build step. See `CHANGELOG.md` for the version history.

```bash
python3 scripts/pack.py          # validate and build package.zip
python3 scripts/pack.py --check  # validate only
```

To publish a new version:

1. bump `version` in `plugin.json` and add an entry to `CHANGELOG.md`;
2. commit, then push a tag matching that version:

   ```bash
   git tag v0.6.1 && git push origin v0.6.1
   ```

3. GitHub Actions verifies the tag matches the manifest version, builds `package.zip`
   and publishes the release.

The bazaar index picks up new releases within 1–3 hours — **no PR needed**.

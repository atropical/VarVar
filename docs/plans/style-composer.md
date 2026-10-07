# Style Composer (BETA) — implementation plan

Target release: **v5.0.0**. Feature flagged BETA in the UI, like the Tailwind export.

## Goal

A new view that lists every local style (paint, text, effect, grid), lets the
user bind / swap / detach the variable behind each bindable field, previews the
result exactly as Figma renders it (per mode), and generates new styles from
token groups. Every write goes through a dry-run diff first.

## Scope

| Style type | Bindable fields |
|---|---|
| Paint | per solid layer: `color`; gradient stops: `color` (via `setBoundVariableForPaint` / gradient stop `boundVariables`) ; layer `opacity` shown read/write as raw value |
| Text | `fontFamily`, `fontStyle`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing`, `paragraphSpacing`, `paragraphIndent` |
| Effect | per layer: `color`, `radius`, `spread`, `offsetX`, `offsetY` (`setBoundVariableForEffect`) |
| Grid | per layer: `count`, `gutterSize`, `offset`, `sectionSize` (`setBoundVariableForLayoutGrid`) |

Also: create, rename, reorder layers, delete (with confirm), raw-value editing
for unbound fields, bulk swap across a selection.

Out of scope for v5.0.0: image fills editing (shown read-only), syncing styles
into JSON export/import.

## Constraints and caveats

- **Editor type**: writes need `figma.editorType === "figma"`. In Dev Mode the
  menu entry shows a read-only notice.
- **Modes**: a style resolves in the consumer's mode — expected behaviour, no
  handling beyond the preview mode switcher.
- **Fonts**: `figma.loadFontAsync` before any text write or preview render.
  Missing fonts flag the row/style, never abort the batch.
- **Library variables**: `importVariableByKeyAsync` before binding remote
  variables; picker lists local + enabled-library variables
  (`figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync`). Adds
  `"permissions": ["teamlibrary"]` to the manifest (approved).
- **Extended collections**: bind to the extension's variable ID, not the parent's
  (see `memory: extended-collection-alias-change`).
- **Compatibility**: picker only offers variables whose `resolvedType` fits the
  field and whose scopes include the field (`FONT_SIZE`, `LINE_HEIGHT`,
  `EFFECT_COLOR`, `GAP`, …). Default-scoped (`ALL_SCOPES`) variables shown in a
  secondary "unscoped" group.
- **Undo**: one apply = one `figma.commitUndo()` step.

## Preview

Two layers:

1. **Instant CSS preview** (UI iframe, every keystroke): swatch for paint
   (stacked layers, gradients, blend modes), editable sample text, card with
   `box-shadow` / `filter` for effects, overlay frame for grids. Unsupported
   bits (image fills, noise/texture, progressive blur, fonts not installed
   locally) show an inline "approximate" badge.
2. **Exact render** (debounced ~300 ms): plugin side applies the draft to a
   single hidden preview node, `exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } })`,
   posts bytes to UI. Mode switcher sets
   `setExplicitVariableModeForCollection` on the preview frame.
   - **Spike first** (Phase 0): verify undo-history impact. Plan A: create one
     hidden node on view open, mutate it, remove on close. Plan B if undo noise
     is unacceptable: render only on explicit "Render" click.

Drafts never touch real styles until Apply.

## Node usage count

Use native `style.getStyleConsumersAsync()` (works with `dynamic-page`) instead
of walking the tree. Fetched lazily on selection, never for the whole list.
Guard with a **time budget**, not a node cap: if the call has not resolved in
~1.5 s, show "counting…" and let the user cancel / ignore; display caps at
`999+`. Phase 0 measures real cost on a large file; fall back to a chunked,
capped manual walk only if the native call proves too slow.
Cached per style, invalidated on `documentchange`.

## Generator (styles from token groups)

1. Pick a style type and a variable group (e.g. `typography/heading`).
2. Each sub-group (`xl`, `lg`, …) becomes one style candidate.
3. Field mapping guessed from **scopes first, names second**
   (`FONT_SIZE` scope or `/size`, `/fs`, `/font-size` → `fontSize`).
4. User corrects the mapping in a table; mapping saved per file via
   `figma.root.setPluginData` so it is reused and travels with the file.
5. Name template for the output style (`{group}/{name}` default).
6. Dry-run diff: create / update (existing style with same name) / skip.

Built-in presets: Typography, Shadow, Colour ramp, Grid.

## Architecture

```
src/
  code.ts                      + COMPOSER_* message handlers (thin)
  composer/                    plugin-side logic
    readStyles.ts              serialise styles → StyleSnapshot
    writeStyles.ts             apply StylePatch[] (fonts, remote vars, undo)
    fields.ts                  field ↔ scope ↔ resolvedType table
    previewNode.ts             hidden node lifecycle + exportAsync
    usageCount.ts              chunked, capped, cancellable count
    generator.ts               group → candidates, mapping guess
  views/StyleComposer.tsx
  components/composer/
    StyleList.tsx  StyleEditor.tsx  FieldRow.tsx  TokenPicker.tsx
    StylePreview.tsx  ModeSwitcher.tsx  GeneratorDialog.tsx  BulkSwapDialog.tsx
  hooks/useComposer.ts         state + postMessage, mirrors useImportData
```

Reuse: `ImportDiffPreview` pattern for the diff, `ConfirmReplaceDialog` for
destructive confirms, `utils/color.ts` / `numberFormat.ts` for display,
`scopeToDTCG.ts` scope knowledge for the compatibility table.

Manifest: new menu entry `{ "command": "compose-styles", "name": "Compose Styles… (BETA)" }`.

## Phases

0. **Spike** (½ day): preview node + `exportAsync` + undo behaviour; library
   variable access; decide Plan A/B.
1. **Read-only composer**: list, search, filter, editor showing values and
   bound tokens, both previews, mode switcher, usage count.
2. **Binding**: token picker, swap/detach, raw edits, dry-run diff, apply,
   undo grouping, font/remote-var handling.
3. **Create & manage**: new style, layer add/remove/reorder, rename, delete,
   bulk swap.
4. **Generator**: presets, mapping guess, saved mappings, dry-run.
5. **Release**: README section, BETA flag, v5.0.0 bump, manual test matrix
   (light/dark, Dev Mode, library vars, extended collections, missing fonts,
   large file for count cap).

## Status (2026-10-07)

Phases 1–5 implemented on `feat/style-composer` (v5.0.0). Type-checks and
builds; pure logic (field guessing, generator, mode/alias/extension
resolution, bulk swap, diff, CSS) smoke-tested outside Figma.

**Not yet verified inside Figma** — the Phase 0 questions are still open and
must be checked by hand:

- Undo history noise from the preview frame (Plan A implemented).
- `getStyleConsumersAsync` speed on a large file.
- Library variable listing / import with the `teamlibrary` permission.
- Gradient-stop bindings written via `boundVariables` on assigned paints.
- Font-variable binding on text styles across modes.

Since added: DTCG composite (typography / shadow) token files as generator
input, grid layer colour editing, and reordering styles within a folder
(`moveLocal*StyleAfter`, applied with the rest of the change set).

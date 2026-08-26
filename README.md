# VarVar - Figma Variable Export Plugin

VarVar is a Figma plugin that allows you to export your Figma variables to JSON, CSV, CSS, or JavaScript formats, and import them back in from JSON, making it easier to integrate your design tokens into your development workflow.

## Features

- **Multiple Export Formats**: Export Figma variables to JSON, CSV, CSS (vanilla or Tailwind CSS v4), or JavaScript
- **JSON Import**: Re-populate collections, modes, variables, and linked-variable references from a previously exported JSON file, choosing between four reconciliation modes and reviewing a dry-run diff before anything is written; `rem`/`em` values are converted back using a root font size you supply, and colour tokens are read in every colour space the DTCG Color Module defines — see below. CSV/CSS/JS import isn't supported, since those formats aren't reliable round-trip sources.
- **Format-Specific Menu Commands**: Direct access to each export format from the Figma menu
- **Linked Variable Support**: Identifies and properly handles linked variables across formats
- **Scope-Aware Types**: JSON, CSV, and JS exports map variable scopes (`CORNER_RADIUS`, `FONT_WEIGHT`, `OPACITY`, etc.) to DTCG `$type`s instead of exporting bare numbers; in JSON the `$type` also has to fit the value it sits beside — see below
- **Unit Options**: CSS, Tailwind, and JSON exports choose the unit dimension values carry — none, `px`, or `rem` with a configurable root font size; CSV and JavaScript always emit bare numbers — see below
- **DTCG-Compliant Values**: JSON writes dimensions and colours in the object shapes the Design Tokens spec defines for them by default, with a toggle for the `"16px"` and `"#ff00ff"` strings earlier versions emitted; CSS, Tailwind, JS, and CSV always write colours as CSS strings — see below
- **Faithful Numbers**: every format emits the shortest decimal that round-trips back to the 32-bit float Figma actually stores, so a `732.8` exports as `732.8` rather than `732.7999877929688`
- **Scope-Driven Tailwind Naming (BETA)**: The Tailwind CSS export takes each variable's theme namespace and unit from its Figma scopes rather than guessing from its name — see below
- **Code Syntax Support**: Figma's per-variable Code Syntax (Web, Android, iOS) is exported in JSON, CSV, and JS, and applied again on import; CSS and JS can optionally use the Web syntax as the emitted variable name
- **Extended Collection Hierarchy Export (Enterprise, BETA)**: All export formats detect Enterprise extended collections and preserve the inheritance model instead of flattening it — see below
- **Preview & Copy**: Preview exported data — syntax-highlighted and legible in both Figma's light and dark themes — and easily copy to clipboard
- **Automatic Downloads**: Exported files are automatically downloaded
- **Row/Column Positioning**: CSV option for spreadsheet formula-like linking

### Linked Variable Handling

- **JSON**: Linked variables start with `$.VARIABLE.PATH`
- **JavaScript**: Linked variables are referenced directly like `collection.mode.variable`
  - Numeric paths are converted to bracket notation: `collection.mode["500"]`
- **CSV**: Linked variables start with `=VARIABLE/PATH`
  - **Option:** Use row & column positions to produce formula-like linking (i.e. `=E7`) in spreadsheet programs
- **CSS**: Linked variables use CSS custom property syntax: `--var-name: var(--VARIABLE)`
- **Tailwind CSS**: Linked variables use CSS custom property syntax with Tailwind naming conventions (i.e. `var(--color-brand-500)`), resolved through the same scope-driven namespace and group separator as the declaration itself

> **Note:** When dealing with linked variables that have multiple modes, the plugin will only link to the first occurrence (i.e., the first mode).

### 🧪 Tailwind CSS Export (BETA)

The CSS export can emit a Tailwind CSS v4 `@theme` block instead of plain custom properties. Naming is driven by each variable's Figma scopes rather than by its name:

- The scopes pick the theme namespace: font size becomes `--text-*`, font weight `--font-weight-*`, font family `--font-*`, letter spacing `--tracking-*`, line height `--leading-*`, corner radius `--radius-*`, any colour scope `--color-*`, gap / width & height / stroke and other dimensions `--spacing-*`, and opacity `--opacity-*`. Variables left on Figma's default scoping — or whose scopes point at no namespace, or disagree with each other — fall back to the older name-based guesses.
- Units follow the scopes too, so a font weight now exports as `600` rather than `600px`.
- A leading group that merely repeats the namespace is dropped: `text/h1` scoped to font size becomes `--text-h1`, not `--text-text--h1`.

Two options shape the output:

- **Join groups with a single dash** *(both CSS outputs; on for Tailwind, off for plain CSS until you set it yourself)*: Figma's `/` group delimiter becomes a single `-`, so `color/brand/500` exports as `--color-brand-500`. Tailwind IntelliSense only suggests theme variables written that way, so it can complete them in `@apply` and `class=""`; turn the option off for `--color-brand--500`. Dashes you typed into the Figma name yourself are always preserved, so a variable named `text/h1--line-height` exports as `--text-h1--line-height` — which is also why the switch is offered for vanilla CSS, where it makes the output paste straight into a Tailwind `@theme` block.
- **Unit for numeric values** and **Apply the unit to unscoped numeric values**: shared with the plain CSS output, and described under [Units, Colours and DTCG Values](#units-colours-and-dtcg-values).

If two different Figma variable names produce the same CSS variable name, only one declaration survives; the collisions are listed in a comment at the top of the output.

Tailwind export is flagged BETA in the plugin, and this naming behaviour may still shift — **we'd love your feedback**: [open an issue](https://github.com/atropical/varvar/issues) if a variable lands in the wrong namespace.

### Units, Colours and DTCG Values

Number variables that Figma scopes as dimensions — spacing, corner radius, font size, letter spacing, and so on — are exported with a unit. Two options decide which unit, and which variables get one:

- **Unit for numeric values** *(CSS, Tailwind, and JSON; `px` by default)*: choose `px`, `rem`, or **None (bare number)**. `rem` reveals a **root font size** field (16 by default) that the Figma number is divided by, so a `32` exports as `2rem`; an empty or invalid entry falls back to 16. Only these units are offered: `px` and `rem` are the two a DTCG `dimension` can express, and relative units (`em`, `%`, `vw`, …) depend on a context the export can't see. **CSV and JavaScript are unaffected** — a CSV cell and a JS value have always been bare numbers, and still are.
- **Apply the unit to unscoped numeric values** *(CSS, Tailwind, and JSON; off by default)*: number variables left on Figma's default scoping (no scopes, or all of them) export as bare numbers. Turn this on and they're treated as dimensions too, taking whichever unit is selected above. Variables explicitly scoped to something that isn't a dimension — font weight, opacity — stay unitless either way.

For JSON there is one more:

- **DTCG-compliant values** *(JSON only, on by default)*: the [Design Tokens spec](https://www.designtokens.org/TR/2025.10/format/) requires an object where a string won't do. A dimension is written as `{ "value": 16, "unit": "px" }`, and a colour as the [Color Module](https://www.designtokens.org/TR/2025.10/color/)'s object — `"colorSpace": "srgb"`, the three channels as 0–1 numbers, an `alpha` only when it isn't 1 (the spec says an omitted alpha means fully opaque), and a 6-digit `hex` fallback alongside. Turn it off to get the `"16px"` and `"#ff00ff"` strings earlier versions of the plugin emitted, for tooling built against those. Numbers with no unit are bare numbers either way. **This is JSON only** — CSS, Tailwind, JavaScript, and CSV always write colours as CSS strings.

A token's `$type` in JSON is a claim about the `$value` beside it, so it's derived from what's actually being emitted rather than from the variable's scopes alone:

- A number exported with a unit is a `dimension`; the same variable with the unit set to none is a `number`.
- A scope that contradicts the variable's own data type — a string scoped to font size, a number scoped to font family — doesn't decide the type; the value does.
- `fontWeight` constrains the value itself, so a variable stays a `fontWeight` only when it holds a number from 1 to 1000 or one of the spec's predefined keywords, spelled exactly. A `1200`, or a `"Bold"` the case-sensitive keyword table doesn't list, is emitted as a `number` or a `string` instead.

The value is never clamped, rounded, or rewritten to make it fit a type — only the type gives way. **CSV's `DTCG Type` column and JavaScript's `dtcgType` field are unaffected**: they describe what a variable is *scoped to*, rather than claiming conformance for a value, and are unchanged.

The unit and DTCG options don't apply to the legacy (v2.x) JSON shape, which predates them and always emits bare numbers and CSS colour strings; they're hidden while that toggle is on.

Across every format, numbers are emitted as the shortest decimal that round-trips back to the 32-bit float Figma stores. A `732.8` typed in Figma exports as `732.8` instead of `732.7999877929688`, and values that genuinely need more digits keep them.

### Code Syntax

Figma lets you give each variable a per-platform **Code Syntax** (Web, Android, iOS). VarVar carries it through:

- **JSON**: under `$extensions.figma.codeSyntax`
- **CSV**: three trailing columns — `Code Syntax (Web)`, `Code Syntax (Android)`, `Code Syntax (iOS)`
- **JavaScript**: a `codeSyntax` field on each value
- **Import**: any code syntax in the JSON is applied to the variables that are created or updated, and shown in the import preview. A file that says nothing about code syntax never clears an existing one.

CSS and JavaScript exports also offer **Use Web code syntax as variable name**: variables that have a Web code syntax set are emitted under that name, both where they're declared and in every reference to them. In CSS a leading `--` is kept rather than doubled, and overrides that can't be a custom property name are ignored and listed in a comment. In JavaScript the name is camelCased if it isn't already a valid identifier, and if it still can't be one the derived name is used.

### 🧪 Extended Collection Hierarchy Export (BETA)

Figma's Enterprise-only [extended collections](https://help.figma.com/hc/en-us/articles/360040328273) let a "child" collection (e.g. a brand) inherit from a "parent" (e.g. a base design system) and override only what differs. All four export formats now detect this and preserve the hierarchy instead of flattening it:

- Values actually overridden in the child collection keep their own value.
- Everything else is exported as a reference into the parent collection's tokens (a `$value` alias in JSON, a plain CSS cascade in CSS, an `=Collection/mode/Variable` reference in CSV, a property-path reference in JS).
- Every value is tagged as inherited or overridden (`$extensions.figma.inherited` in JSON, an `Inherited` column in CSV, an `inherited` field in JS; CSS relies on the cascade itself rather than a tag).
- **JSON only:** output splits into `base.tokens.json` (all non-extended collections) plus one file per extended collection, bundled into a single `.zip` download. CSS, CSV, and JS stay single-file, representing inheritance inline.

This only activates when extended collections are present in the file — accounts without Enterprise extended collections see no change to their exports. This feature is new and we haven't been able to validate it against a real Enterprise file ourselves, so **we'd love your feedback**: [open an issue](https://github.com/atropical/varvar/issues) if the output doesn't look right.

## Installation

1. Open Figma and go to the Community tab
2. Search for "VarVar"
3. Click on the plugin and then click "Install"

## Usage

### Quick Export (Format-Specific)

Access format-specific exports directly from the Figma menu:

1. Open your Figma file containing variables
2. Go to **Plugins** → **VarVar** → Choose your format:
   - **Export as JSON** - Structured JSON data with nested groups
     - *Unit for numeric values* - `px` (default), `rem` with a root font size, or none
     - *Apply the unit to unscoped numeric values* - opt-in unit for numbers left on Figma's default scoping
     - *DTCG-compliant values* - on by default; off restores the `"16px"` and `"#ff00ff"` strings
   - **Export as JavaScript** - JavaScript objects with proper references (always bare numbers)
   - **Export as CSV** - Spreadsheet-compatible data (always bare numbers)
   - **Export as CSS & Tailwind** - CSS custom properties for web development
     - *Tailwind CSS or vanilla* - Tailwind CSS format with `@theme` directive (BETA)
     - *Join groups with a single dash* - available for both CSS outputs
     - *Unit for numeric values* and *Apply the unit to unscoped numeric values* - as for JSON
     - *Use Web code syntax as variable name* - also available for JavaScript
3. Configure filename and options (if applicable)
4. Click "Export Variables"
5. The exported file will be automatically downloaded

### Generic Export

For format selection within the interface:

1. Open your Figma file containing variables
2. Go to **Plugins** → **VarVar** → **Export Variables**
3. Choose your desired export format
4. Configure filename and options
5. Click "Export Variables"
6. The exported file will be automatically downloaded

### Preview and Copy

- Toggle the "Preview output" switch to see the exported data within the plugin interface
- Use the "Select to Copy" button and copy (Ctrl/Cmd + C) the exported data to your clipboard

> **Note:** Programmatically copying is currently not supported by Figma Plugin APIs.

### Import

1. Open your Figma file
2. Go to **Plugins** → **VarVar** → **Import…**
3. Choose one or more JSON files previously exported by VarVar (current or legacy format; if you exported an Enterprise extended-collection `.zip`, select its unzipped files together)
4. Choose how the file should be reconciled with the variables already in the document:
   - **Merge** (default) — creates missing collections, modes, and variables and updates the ones that match by name. Nothing is ever deleted, so existing component links are never broken.
   - **Update only** — touches only what exists in both the file and the document. Nothing is created and nothing is deleted.
   - **Merge and delete anything not in the file** — merges, then deletes any variable, mode, or whole collection the file doesn't mention. Matches are updated in place, so their component links survive.
   - **Clean import** — deletes *every* existing local variable collection first, not just the ones named in the JSON, then imports fresh. Every component link is broken, even for variables that match the file exactly.
5. Click **Preview import** for a dry-run diff of exactly what would be created, updated, deleted, or left unchanged, down to per-mode values and code syntax, without writing anything
6. If the file carries `rem` or `em` values, which Figma has no equivalent for, a **root font size** field appears. Every such value is multiplied by it — with 16, `2rem` becomes `32` — and the diff re-runs as you change it, so what you see is what would be written
7. Click **Confirm import** to apply it (the two deleting modes ask you to confirm first). Collections, modes, variables, and linked-variable references are recreated, and a summary of what was created/updated (plus any warnings) is shown

> **Note:** Import reads dimensions in both spellings — the DTCG `{ "value": 16, "unit": "px" }` object and the older `"16px"` string — even mixed within one file. A unit that can't be reversed into a Figma number (`pt`, `%`, `vh`, …) has its suffix stripped and the number imported as-is, with a warning naming the value.

> **Note:** Colours are read in both spellings too: the DTCG object form, in all fourteen colour spaces the [Color Module](https://www.designtokens.org/TR/2025.10/color/) defines, and the CSS colour strings VarVar has always exported. `srgb`, `srgb-linear`, `hsl`, and `hwb` are sRGB in different coordinates and convert exactly. The wide-gamut and perceptual spaces — `display-p3`, `oklch`, `lab`, `rec2020`, and the rest — are converted to sRGB and named in a warning, because a Figma variable is sRGB and can't hold them faithfully. Where such a colour falls outside the sRGB gamut, the token's own `hex` fallback is used if it has one; otherwise it's mapped to the nearest sRGB colour.

> **Note:** A file that doesn't carry VarVar's own `$extensions.figma.resolvedType` — a hand-authored or third-party token file — has its Figma variable type derived from the value rather than from `$type` alone, since a conformant `fontWeight` may hold either a number or a keyword. A number creates a FLOAT variable; a keyword creates a STRING holding it verbatim, never translated to a number. If a token's modes disagree, the variable becomes a STRING, which holds every spelling exactly, and the summary warns.

> **Note:** Only JSON is supported for import — CSV, CSS, and JS aren't reliable round-trip sources for reconstructing variables.

> **Note:** A leading `.` or `_` is Figma's own convention for marking a collection, variable, or group "private" (hidden from publishing) — common in real design systems, not an edge case. Import handles it correctly: linked-variable references are matched against your file's actual collection/mode names rather than blindly split on `.`, and any newly created collection/variable whose name starts with `.` or `_` gets `hiddenFromPublishing` set to match, so the privacy actually carries over. Check the import summary's warnings for anything it couldn't confidently match.

## Architecture

VarVar is built with a modular architecture for maintainability and scalability:

### Core Components

- **Type System**: Strict TypeScript enums and interfaces for type safety
- **UI Components**: Reusable React components for consistent interface
- **Format Views**: Dedicated views for each export format
- **Export Utilities**: Format-specific processing functions with JSDoc documentation

### File Structure

```
src/
├── components/          # Reusable UI components
│   ├── PluginDialogShell.tsx  # Layout shell with padding and footer
│   ├── ExportHeader.tsx
│   ├── ExportLayout.tsx
│   ├── FilenameInput.tsx
│   ├── ExportButton.tsx
│   ├── OutputPreview.tsx
│   ├── ExportOptions.tsx
│   ├── FileImportInput.tsx    # File picker for JSON import
│   ├── ImportOptions.tsx      # Import reconciliation mode picker
│   ├── ConfirmReplaceDialog.tsx  # Confirmation for the two deleting import modes
│   ├── ImportDiffPreview.tsx  # Dry-run diff shown before an import is applied
│   ├── ImportSummaryPanel.tsx # Import result counts and warnings
│   ├── HelpTip.tsx            # "?" badge with a figma-kit tooltip
│   └── Footer.tsx
├── hooks/              # Custom React hooks
│   ├── useExportData.ts    # Hook for managing export data and state
│   └── useImportData.ts    # Hook for managing import data and state
├── views/              # Format-specific export/import views
│   ├── ExportView.tsx      # Generic export with format selector
│   ├── ExportJSON.tsx
│   ├── ExportCSV.tsx
│   ├── ExportCSS.tsx
│   ├── ExportJS.tsx
│   └── ImportJSON.tsx      # JSON import view
├── utils/              # Export/import processing utilities
│   ├── collectionToJSON.ts
│   ├── collectionToCSV.ts
│   ├── collectionToCSS.ts
│   ├── collectionToJS.ts
│   ├── collectionToTailwind.ts
│   ├── importJSON.ts       # Parses exported JSON and recreates variables in Figma
│   ├── clipboard.ts
│   ├── color.ts
│   ├── colorSpaces.ts      # DTCG colour-space maths for reading object-form colours
│   ├── numberFormat.ts     # Shortest decimals that round-trip through Figma's float32
│   ├── units.ts            # Export unit choice, rem conversion, unit parsing on import
│   └── stringTransformation.ts
├── types.d.ts          # TypeScript definitions and enums
├── code.ts             # Plugin main logic
└── ui.tsx              # UI router and main app
```

## Development

To set up the development environment:

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Run the development server:
   ```
   npm run dev
   ```

### Building the Plugin

To build the plugin for production:
```
npm run build
```
## Author
VarVar is developed and maintained by [Atropical AS](https://atropical.no).
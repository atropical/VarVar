TAGLINE:
Export Figma Variables to JSON, JS, CSV, CSS and Tailwind CSS. Import them back in from JSON.

DESCRIPTION:
**VarVar** is a Figma plugin that allows you to export your Figma variables to JSON, JS, CSV, CSS, or Tailwind CSS formats, making it easier to integrate your design tokens into your development workflow. It can also import a previously exported JSON file back into a document, recreating collections, modes, variables, and linked variables.

## Features
**Multiple Export Formats:** JSON, JavaScript, CSV, CSS, and Tailwind CSS
**JSON Import§:** Re-populate collections, modes, variables, and linked-variable references from a previously exported JSON file, with four reconciliation modes (merge, update only, merge and prune, or clean import) and a dry-run diff preview of exactly what would change before anything is written
**Format-Specific Menu Commands:** Direct access to each export format from the Figma menu
**Linked Variable Support:** Properly handles linked variables across all formats†
**Scope-Aware Types:** JSON, CSV, and JS exports map variable scopes (`CORNER_RADIUS`, `FONT_WEIGHT`, `OPACITY`, etc.) to DTCG `$types` instead of bare numbers
**Scope-Driven Tailwind Naming (BETA)¶:** The Tailwind CSS export takes each variable's theme namespace and unit from its Figma scopes instead of guessing from its name — font size becomes `--text-*`, font weight `--font-weight-*`, letter spacing `--tracking-*`, colours `--color-*`, and so on, so a font weight no longer exports as `600px`. Groups are joined with a single dash by default (`--color-brand-500`), which is what Tailwind IntelliSense needs to suggest the variable in `@apply` and `class=""`; a toggle brings back `--`. Plain CSS is unchanged.
**Code Syntax:** Figma's per-variable Code Syntax (Web, Android, iOS) is exported in JSON, CSV, and JS, and applied again on import. CSS and JS exports can optionally use the Web code syntax as the emitted variable name, in declarations and references alike
**Unit Options:** CSS and Tailwind exports can optionally append `px` to number variables left on Figma's default scoping; anything explicitly scoped to a non-dimension stays unitless
**Extended Collection Hierarchy Export (Enterprise, BETA)‡:** All export formats detect Enterprise extended collections and preserve inherited vs. overridden values instead of flattening them. JSON additionally splits into a .zip of per-collection files when extended collections are present; CSS, CSV, and JS represent the inheritance inline in a single file.
**Legacy Format Toggle:** JSON, CSV, and JS exports have a "legacy format (v2.x)" option to export in the pre-3.0 shape, for anyone whose tooling relies on it
**Preview & Copy:** Preview exported data and easily copy to clipboard
**Download:** Exported variables can be downloaded as files
**Row/Column Positioning:** CSV option for spreadsheet formula-like linking


### Linked Variable Handling

**JSON:** Linked variables start with `$.VARIABLE.PATH`
**JavaScript:** Linked variables are referenced directly like `collection.mode.variable`
**CSV:** Linked variables start with `=VARIABLE/PATH` (with optional row/column positioning)
**CSS:** Linked variables use CSS custom property syntax: `--var-name: var(--VARIABLE)`
**Tailwind CSS:** Linked variables use CSS custom property syntax with Tailwind naming conventions (i.e. `var(--color-brand-500)`), through the same scope-driven namespace and group separator as the declaration


### Notes:

† When dealing with linked variables that have multiple modes, the plugin will only link to the first occurrence (i.e., the first mode it finds).
‡ Enterprise fella? We'd love your feedback on this one, please open an issue with anything that looks off.
¶ Tailwind export is still BETA, and the naming rules may change. If a variable lands in the wrong namespace, please open an issue.
§ A leading `.` or `_` is Figma's own convention for marking a collection, variable, or group "private" (hidden from publishing). Import handles this correctly: linked-variable references are matched against your file's actual collection/mode names (so a `.` isn't confused with the JSON path separator), and any newly created collection/variable whose name starts with `.` or `_` gets `hiddenFromPublishing` set to match, so the privacy actually carries over rather than just looking private. Still review the import summary's warnings for anything it couldn't confidently match.



## Usage
### Design Mode
1. Open your Figma file containing variables
2. Run the VarVar plugin from the Plugins menu
3. Choose your desired export format (JSON, JS, CSV or CSS & Tailwind)
4. Click "Export Variables"
5. Click "Download File". If `Preview output` is off, the exported file will be automatically downloaded


### Dev Mode
1. Open your Figma file containing variables
2. Switch to Dev Mode
3. Run the VarVar plugin from the Plugins menu
4. Choose your desired export format (JSON, JS, CSV or CSS & Tailwind)
5. Click "Export Variables"
6. Click "Download File". If `Preview output` is off, the exported file will be automatically downloaded


### Preview and Copy
- Toggle the "Preview output" switch to see the exported data within the plugin interface.
- Copy the results in one click!


### Importing Variables (JSON)
1. Open your Figma file
2. Run the VarVar plugin from the Plugins menu
3. Choose **Import…**
4. Select one or more JSON files previously exported by VarVar
5. Pick how the file is reconciled with what's already in the document: **Merge** (create and update, never delete), **Update only** (touch only what exists in both), **Merge and delete anything not in the file**, or **Clean import** (delete every existing local collection first). The two deleting modes ask you to confirm.
6. Click "Preview import" to see a dry-run diff of everything that would be created, updated, deleted, or left unchanged
7. Click "Confirm import" to apply it


VarVar is open source, consider contributing. Code available on [GitHub](https://github.com/atropical/varvar).

For bug reports, suggestions, or questions, please open an [issue](https://github.com/atropical/varvar/issues).



TAGS:
variables, export variables, variables to json, variables to javascript, variables to csv, variables to css, variables to tailwind, tailwind css, developer, tokens, export, import, import variables, json to variables, json, csv, css, design tokens, figma variables, menu commands, quick export, legacy format, code syntax, tailwind intellisense, design system

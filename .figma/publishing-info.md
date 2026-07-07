TAGLINE:
Export Figma Variables to JSON, JS, CSV, CSS and Tailwind CSS — and import them back in from JSON — with format-specific menu commands.

DESCRIPTION:
**VarVar** is a Figma plugin that allows you to export your Figma variables to JSON, JS, CSV, CSS, or Tailwind CSS formats, making it easier to integrate your design tokens into your development workflow. It can also import a previously exported JSON file back into a document, recreating collections, modes, variables, and linked variables. Now with format-specific menu commands for faster exports!

## Features
**Multiple Export Formats:** JSON, JavaScript, CSV, CSS, and Tailwind CSS
**JSON Import§:** Re-populate collections, modes, variables, and linked-variable references from a previously exported JSON file, with an optional "replace existing variables" mode (deletes all existing local variable collections first, behind a confirmation dialog)
**Format-Specific Menu Commands:** Direct access to each export format from the Figma menu
**Linked Variable Support:** Properly handles linked variables across all formats†
**Scope-Aware Types:** JSON, CSV, and JS exports map variable scopes (`CORNER_RADIUS`, `FONT_WEIGHT`, `OPACITY`, etc.) to DTCG `$types` instead of bare numbers
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
**Tailwind CSS:** Linked variables use CSS custom property syntax with Tailwind naming conventions


### Notes:

† When dealing with linked variables that have multiple modes, the plugin will only link to the first occurrence (i.e., the first mode it finds).
‡ Enterprise fella? We'd love your feedback on this one, please open an issue with anything that looks off.
§ A leading `.` or `_` is Figma's own convention for marking a collection, variable, or group "private" (hidden from publishing) — not unusual at all, plenty of real design systems use it. Import handles this correctly: linked-variable references are matched against your file's actual collection/mode names (so a `.` isn't confused with the JSON path separator), and any newly created collection/variable whose name starts with `.` or `_` gets `hiddenFromPublishing` set to match, so the privacy actually carries over rather than just looking private. Still review the import summary's warnings for anything it couldn't confidently match.



## Usage
### Design Mode
1. Open your Figma file containing variables
2. Run the VarVar plugin from the Plugins menu
3. Choose your desired export format (JSON, JS, CSV or CSS)
4. Click "Export Variables"
5. Click "Download File". If `Preview output` is off, the exported file will be automatically downloaded


### Dev Mode
1. Open your Figma file containing variables
2. Switch to Dev Mode
3. Run the VarVar plugin from the Plugins menu
4. Choose your desired export format (JSON, JS, CSV or CSS)
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
5. Optionally turn on "Replace existing variables" — this deletes all existing local variable collections before importing, so you'll be asked to confirm first
6. Click "Import Variables"


VarVar is open source, consider contributing. Code available on [GitHub](https://github.com/atropical/varvar).

For bug reports, suggestions, or questions, please open an [issue](https://github.com/atropical/varvar/issues).



TAGS:
variables, export variables, variables to json, variables to javascript, variables to csv, variables to css, variables to tailwind, tailwind css, developer, tokens, export, import, import variables, json to variables, json, csv, css, design tokens, figma variables, menu commands, quick export, legacy format

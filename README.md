# VarVar - Figma Variable Export Plugin

VarVar is a Figma plugin that allows you to export your Figma variables to JSON, CSV, CSS, or JavaScript formats, making it easier to integrate your design tokens into your development workflow.

## Features

- **Multiple Export Formats**: Export Figma variables to JSON, CSV, CSS (vanilla or Tailwind CSS v4), or JavaScript
- **Format-Specific Menu Commands**: Direct access to each export format from the Figma menu
- **Linked Variable Support**: Identifies and properly handles linked variables across formats
- **Scope-Aware Types**: JSON, CSV, and JS exports map variable scopes (`CORNER_RADIUS`, `FONT_WEIGHT`, `OPACITY`, etc.) to DTCG `$type`s instead of exporting bare numbers
- **Extended Collection Hierarchy Export (Enterprise, BETA)**: JSON export detects Enterprise extended collections and preserves the inheritance model — see below
- **Preview & Copy**: Preview exported data and easily copy to clipboard
- **Automatic Downloads**: Exported files are automatically downloaded
- **Row/Column Positioning**: CSV option for spreadsheet formula-like linking

### Linked Variable Handling

- **JSON**: Linked variables start with `$.VARIABLE.PATH`
- **JavaScript**: Linked variables are referenced directly like `collection.mode.variable`
  - Numeric paths are converted to bracket notation: `collection.mode["500"]`
- **CSV**: Linked variables start with `=VARIABLE/PATH`
  - **Option:** Use row & column positions to produce formula-like linking (i.e. `=E7`) in spreadsheet programs
- **CSS**: Linked variables use CSS custom property syntax: `--var-name: var(--VARIABLE)`
- **Tailwind CSS**: Linked variables use CSS custom property syntax with Tailwind naming conventions

> **Note:** When dealing with linked variables that have multiple modes, the plugin will only link to the first occurrence (i.e., the first mode).

### 🧪 Extended Collection Hierarchy Export (BETA)

Figma's Enterprise-only [extended collections](https://help.figma.com/hc/en-us/articles/360040328273) let a "child" collection (e.g. a brand) inherit from a "parent" (e.g. a base design system) and override only what differs. VarVar's JSON export now detects this and preserves the hierarchy instead of flattening it:

- Values actually overridden in the child collection get their own `$value`.
- Everything else is exported as an alias reference into the parent collection's tokens.
- Every value is tagged with `$extensions.figma.inherited: true/false`.
- Output splits into `base.tokens.json` (all non-extended collections) plus one file per extended collection, bundled into a single `.zip` download.

This only activates when extended collections are present in the file — accounts without Enterprise extended collections see no change to their JSON export. This feature is new and we haven't been able to validate it against a real Enterprise file ourselves, so **we'd love your feedback**: [open an issue](https://github.com/atropical/varvar/issues) if the output doesn't look right.

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
   - **Export as JavaScript** - JavaScript objects with proper references
   - **Export as CSV** - Spreadsheet-compatible data
   - **Export as CSS** - CSS custom properties for web development
     - *Tailwind CSS or vanilla* - Tailwind CSS format with `@theme` directive (BETA)
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
│   └── Footer.tsx
├── hooks/              # Custom React hooks
│   └── useExportData.ts    # Hook for managing export data and state
├── views/              # Format-specific export views
│   ├── ExportView.tsx      # Generic export with format selector
│   ├── ExportJSON.tsx
│   ├── ExportCSV.tsx
│   ├── ExportCSS.tsx
│   └── ExportJS.tsx
├── utils/              # Export processing utilities
│   ├── collectionToJSON.ts
│   ├── collectionToCSV.ts
│   ├── collectionToCSS.ts
│   ├── collectionToJS.ts
│   ├── collectionToTailwind.ts
│   ├── clipboard.ts
│   ├── color.ts
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
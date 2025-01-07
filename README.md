# VarVar - Figma Variable Export Plugin

VarVar is a Figma plugin that allows you to export your Figma variables to JSON, CSV or CSS formats, making it easier to integrate your design tokens into your development workflow.

## Features

- Export Figma variables to JSON, CSV, CSS or JS formats
- Identifies linked variables*
   - JSON: linked variables start with `$.VARIABLE.PATH`
   - JS: linked variables are referenced directly like `collection.mode.variable`
     - Numeric paths are converted to bracket notation: `collection.mode["500"]`
   - CSV: linked variables start with `=VARIABLE/PATH`
     - **Option:** *Use row & column positions.<sup>*</sup> This will produce instead a "formula-like" (i.e. `=E7`) linking in spreadsheet programs.
   - CSS: linked variables will be linked like so `--var-name: var(--VARIABLE)`
- Preview exported data within the plugin interface
- Automatically download exported files

<sup>*</sup> When dealing with linked variables that have multiple modes, the plugin will only link to the first occurrence (i.e., the first mode).

## Figma Installation

1. Open Figma and go to the Community tab
2. Search for "VarVar"
3. Click on the plugin and then click "Install"

## Usage
### Design Mode
1. Open your Figma file containing variables
2. Run the VarVar plugin from the Plugins menu
3. Choose your desired export format (JSON, JS, CSV or CSS)
4. Click "Export Variables"
5. The exported file will be automatically downloaded

### Dev Mode
1. Open your Figma file containing variables
2. Run the VarVar plugin from the Plugins menu
3. Choose your desired export format (JSON, JS, CSV or CSS)
4. Click "Export Variables"
5. The exported file will be automatically downloaded

### Preview and Copy

- Toggle the "Preview output" switch to see the exported data within the plugin interface
- Use the "Select all" button and copy<sup>†</sup> (Ctrl/Cmd + C) the exported data to your clipboard

<sup>†</sup> Programmatically copying is currently not supported by Figma Plugin APIs.

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
VarVar is developed and maintained by Atropical AS.
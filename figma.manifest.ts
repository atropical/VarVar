export default {
  "name": "VarVar",
  "id": "1341506281991381482",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "src/index.html",
  "editorType": ["figma", "dev"],
  "capabilities": ["inspect"],
  "menu": [
    {"name": "Export as…",
      "menu": [
        { "command": "export-json", "name": "JSON" },
        { "command": "export-js", "name": "JavaScript" },
        { "command": "export-csv", "name": "CSV" },
        { "command": "export-css", "name": "CSS" }
      ]
    },
    {"separator": true},
    { "command": "export", "name": "Export Variables" }
  ],
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["none"]
  }
}

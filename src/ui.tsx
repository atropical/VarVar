import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { Flex, Text, RadioGroup, Button, Link, Switch, Label, Input } from "figma-kit";
import "figma-kit/styles.css";
import { OutputFormats } from "./types";

const secondaryTextStyle = {color: 'var(--figma-color-text-secondary)'};
const App: React.FC = () => {
  let defaultFilename = `exported_variables`;
  const [format, setFormat] = useState<OutputFormats>("json");
  const [filename, setFilename] = useState<string>(defaultFilename);
  const [seeOutput, setSeeOutput] = useState<boolean>(true);
  const [useRowColumnPos, setUseRowColumnPos] = useState<boolean>(false);
  const [exportedData, setExportedData] = useState<string>("");
  const [variablesCount, setVariablesCount] = useState<number>(0);

  const handleFilename = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value
    if(!value) {
      value = defaultFilename;
    }
    setFilename(value.replace(`.${format}`, ''));
  };
  const handleExport = () => {
    parent.postMessage({ pluginMessage: { type: "EXPORT.SUCCESS", format, useLinkedVarRowAndColPos: useRowColumnPos } }, "*");
  };
  const handleSelectToCopy = () => {
    if (exportedData) {
      const textArea = document.querySelector('#varvar-exported-output');
      const selection = document.getSelection();
      if (textArea && selection) {
          selection.selectAllChildren(textArea);
      }
      else {
        console.warn('Unable to select all code.')
      }
    }
  };
  useEffect(() => {

    window.onmessage = ({ data:  {pluginMessage } }) => {

      if (pluginMessage.type === "INFO.BASIC_INFO") {
        setVariablesCount(pluginMessage.count);
        defaultFilename =  `${pluginMessage.filename}_variables`;
        setFilename(defaultFilename);
      }
      else if (pluginMessage.type === "EXPORT.SUCCESS.RESULT") {
        setExportedData(pluginMessage.data);

        const blob = new Blob([pluginMessage.data], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${filename}.${pluginMessage.format}`;
        link.click();
        URL.revokeObjectURL(url);
      }
    };
  }, [filename, format]);
  parent.postMessage({ pluginMessage: { type: "INFO.GET_BASIC_INFO" } }, "*");
  return (
    <Flex direction="column" gap="4">
        <Flex direction="column" gap="2">
          <Text style={secondaryTextStyle}>Select a format</Text>
          <RadioGroup.Root value={format} onValueChange={(value) => setFormat(value as OutputFormats)}>
            <RadioGroup.Label>
              <RadioGroup.Item
                value="json"
              />
              JSON
            </RadioGroup.Label>
            <RadioGroup.Label>
              <RadioGroup.Item value="js" />
              JavaScript
            </RadioGroup.Label>
            <RadioGroup.Label>
              <RadioGroup.Item
                value="csv"
              />
              CSV
            </RadioGroup.Label>
            <RadioGroup.Label>
              <RadioGroup.Item
                value="css"
              />
              CSS
            </RadioGroup.Label>
          </RadioGroup.Root>
        </Flex>
        <Flex gap="2" direction="column">
          <Label style={secondaryTextStyle} htmlFor="varvar-filename">Filename</Label>
          <Input
            id="varvar-filename"
            placeholder={`Ex.: export_variables.${format}`}
            value={`${filename}.${format}`}
            required
            selectOnClick
            pattern={`^[a-zA-Z0-9_-]+\.(${format})$`}
            title={`Enter a valid filename with .${format} extension`}
            onChange={handleFilename}
            ></Input>
        </Flex>
        <Flex gap="2" direction="column">
        <Label style={secondaryTextStyle}>Options</Label>
        {
          format === 'csv' && (
            <Flex gap="2">
              <Switch id="varvar-export-row-column-pos" onCheckedChange={setUseRowColumnPos} checked={useRowColumnPos} />
              <Label htmlFor="varvar-export-row-column-pos">Use row &amp; column positions (i.e.: <code>=E7</code>) for linked vars</Label>
            </Flex>
          )
        }
          <Flex gap="2">
            <Switch id="varvar-preview-output" onCheckedChange={setSeeOutput} checked={seeOutput} /> <Label htmlFor="varvar-preview-output">Preview output</Label>
          </Flex>
        </Flex>
        <Button
            variant="primary"
            fullWidth={true}
            size="medium"
            onClick={handleExport}
          >
              Export Variables ({variablesCount})
        </Button>
        {
          seeOutput && exportedData && 
          <Flex direction="column" gap="2">
            <Text>Code Preview</Text>
            <Flex direction="column"
              gap="2"
              style={{
                position: 'relative',
                border: 'var(--figma-color-border)',
                borderRadius: 4,
                padding: 8,
                backgroundColor: 'rgba(0,0,0,.25)',
              }}>
              <Flex direction="column">
                <Button
                  variant="secondary"
                  onClick={handleSelectToCopy}
                  style={{
                    alignSelf: 'end',
                    position: 'sticky',
                    top: 4,
                    right: 4,
                    backdropFilter: 'blur(4px)'
                  }}
                >
                  Select to Copy
                </Button>
                <Text style={{marginTop:'-2rem'}}>
                  <pre
                    id="varvar-exported-output"
                    style={{overflowX: 'auto',}}
                    contentEditable
                    spellCheck="false"
                  >{exportedData.toString()}</pre>
                </Text>
              </Flex>
            </Flex>
          </Flex>
        }
    <Text style={secondaryTextStyle}>
      This is an open source plugin. <Link href="https://github.com/atropical/dev_">Contribute ↗</Link>
      <br />
      Initiated by <Link href="https://atropical.no?utm_source=figma-plugin">Atropical</Link>.</Text>
    </Flex>
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

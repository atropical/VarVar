import React, { useState, useEffect } from "react";
import { Flex, Text, RadioGroup } from "figma-kit";
import { OutputFormats } from "../types.d";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportHeader } from "../components/ExportHeader";
import { FilenameInput } from "../components/FilenameInput";
import { ExportOptions } from "../components/ExportOptions";
import { ExportButton } from "../components/ExportButton";
import { OutputPreview } from "../components/OutputPreview";
import { ExportLayout } from "../components/ExportLayout";

/**
 * Generic export view with format selector (default command)
 */
export const ExportView: React.FC = () => {
    const [format, setFormat] = useState<OutputFormats>(OutputFormats.JSON);
    const [filename, setFilename] = useState<string>("exported_variables");
    const [seeOutput, setSeeOutput] = useState<boolean>(true);
    const [useRowColumnPos, setUseRowColumnPos] = useState<boolean>(false);
    const [exportedData, setExportedData] = useState<string>("");
    const [variablesCount, setVariablesCount] = useState<number>(0);
    const [editorType, setEditorType] = useState<string>("");

    const handleExport = () => {
        parent.postMessage({ 
            pluginMessage: { 
                type: "EXPORT.SUCCESS" as any, 
                format, 
                useLinkedVarRowAndColPos: useRowColumnPos 
            } 
        }, "*");
    };

    const handleSelectToCopy = () => {
        if (exportedData) {
            const textArea = document.querySelector('#varvar-exported-output');
            const selection = document.getSelection();
            if (textArea && selection) {
                selection.selectAllChildren(textArea);
            } else {
                console.warn('Unable to select all code.');
            }
        }
    };

    useEffect(() => {
        window.onmessage = ({ data: { pluginMessage } }) => {
            if (pluginMessage.type === "INFO.BASIC_INFO") {
                setVariablesCount(pluginMessage.count);
                setEditorType(pluginMessage.editorType || "");
                const defaultFilename = `${pluginMessage.filename}_variables`;
                setFilename(defaultFilename);
            } else if (pluginMessage.type === "EXPORT.SUCCESS.RESULT") {
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

    // Request basic info on mount (only if not already received)
    useEffect(() => {
        if (variablesCount === 0) {
            parent.postMessage({ pluginMessage: { type: "INFO.GET_BASIC_INFO" as any } }, "*");
        }
    }, [variablesCount]);

    const formControls = (
        <>
            <ExportHeader format={format} />
            
            <Flex direction="column" gap="2">
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Select a format
                </Text>
                <RadioGroup.Root value={format} onValueChange={(value) => setFormat(value as OutputFormats)}>
                    <RadioGroup.Label>
                        <RadioGroup.Item value={OutputFormats.JSON} />
                        JSON
                    </RadioGroup.Label>
                    <RadioGroup.Label>
                        <RadioGroup.Item value={OutputFormats.JS} />
                        JavaScript
                    </RadioGroup.Label>
                    <RadioGroup.Label>
                        <RadioGroup.Item value={OutputFormats.CSV} />
                        CSV
                    </RadioGroup.Label>
                    <RadioGroup.Label>
                        <RadioGroup.Item value={OutputFormats.CSS} />
                        CSS
                    </RadioGroup.Label>
                </RadioGroup.Root>
            </Flex>

            <ExportOptions
                format={format}
                seeOutput={seeOutput}
                useRowColumnPos={useRowColumnPos}
                onSeeOutputChange={setSeeOutput}
                onUseRowColumnPosChange={setUseRowColumnPos}
            />

            <FilenameInput 
                format={format}
                filename={filename}
                onFilenameChange={setFilename}
            />

            <ExportButton 
                variablesCount={variablesCount}
                onExport={handleExport}
            />
        </>
    );

    const preview = seeOutput && exportedData ? (
        <OutputPreview 
            exportedData={exportedData}
            onSelectToCopy={handleSelectToCopy}
        />
    ) : null;

    return (
        <PluginDialogShell>
            <ExportLayout 
                editorType={editorType}
                children={formControls}
                preview={preview}
            />
        </PluginDialogShell>
    );
};

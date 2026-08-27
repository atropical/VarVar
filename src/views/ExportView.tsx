import React, { useState, useEffect } from "react";
import { Flex, Text, RadioGroup } from "figma-kit";
import { OutputFormats } from "../types.d";
import { PluginDialogShell } from "../components/PluginDialogShell";
import { ExportHeader } from "../components/ExportHeader";
import { ExportOptions } from "../components/ExportOptions";
import { ExportActions } from "../components/ExportActions";
import { OutputPreview } from "../components/OutputPreview";
import { ExportLayout } from "../components/ExportLayout";
import { useExportData } from "../hooks/useExportData";

interface ExportViewProps {
    editorType?: string;
}

/**
 * Generic export view with format selector (default command)
 */
export const ExportView: React.FC<ExportViewProps> = ({ editorType = "" }) => {
    const [format, setFormat] = useState<OutputFormats>(OutputFormats.JSON);
    const {
        filename,
        setFilename,
        seeOutput,
        setSeeOutput,
        useRowColumnPos,
        setUseRowColumnPos,
        useTailwindFormat,
        setUseTailwindFormat,
        useSingleDashSeparator,
        setUseSingleDashSeparator,
        useCodeSyntaxName,
        setUseCodeSyntaxName,
        exportUnit,
        setExportUnit,
        rootFontSize,
        setRootFontSize,
        appendPxToUnscoped,
        setAppendPxToUnscoped,
        dtcgCompliantValues,
        setDtcgCompliantValues,
        useLegacyFormat,
        setUseLegacyFormat,
        exportedData,
        setExportedData,
        variablesCount,
        handleExport,
        handleSelectToCopy,
        handleDownload
    } = useExportData({ format, useRowColumnPos: false });

    // Reset useRowColumnPos when format changes to non-CSV
    useEffect(() => {
        if (format !== OutputFormats.CSV) {
            setUseRowColumnPos(false);
        }
    }, [format]);

    // Reset useTailwindFormat when format changes to non-CSS
    useEffect(() => {
        if (format !== OutputFormats.CSS) {
            setUseTailwindFormat(false);
        }
    }, [format]);

    // Reset useLegacyFormat when format changes to one without a legacy shape (CSS)
    useEffect(() => {
        if (format === OutputFormats.CSS) {
            setUseLegacyFormat(false);
        }
    }, [format]);

    // Reset useCodeSyntaxName when format changes to one that doesn't emit a
    // variable name of its own (JSON/CSV)
    useEffect(() => {
        if (format !== OutputFormats.CSS && format !== OutputFormats.JS) {
            setUseCodeSyntaxName(false);
        }
    }, [format]);

    // Reset appendPxToUnscoped when the format changes to one that never emits a
    // unit, so switching back doesn't silently carry a choice made elsewhere.
    useEffect(() => {
        if (format !== OutputFormats.CSS && format !== OutputFormats.JSON) {
            setAppendPxToUnscoped(false);
        }
    }, [format]);

    // The unit choice itself is deliberately kept across format switches: the hook
    // only sends it for the formats that emit a unit (CSS/Tailwind, JSON), and all
    // three units it offers are legal everywhere, so nothing needs resetting.

    // Clear exported data when format changes to refresh preview
    useEffect(() => {
        setExportedData("");
    }, [format]);

    const formControls = (
        <>
            <ExportHeader format={format} />
            
            <Flex direction="column" gap="2">
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    Select a format
                </Text>
                <RadioGroup.Root orientation="vertical" value={format} onValueChange={(value) => setFormat(value as OutputFormats)}>
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
                        CSS &amp; Tailwind
                    </RadioGroup.Label>
                </RadioGroup.Root>
            </Flex>

            <ExportOptions
                format={format}
                seeOutput={seeOutput}
                useRowColumnPos={useRowColumnPos}
                useTailwindFormat={useTailwindFormat}
                useSingleDashSeparator={useSingleDashSeparator}
                useCodeSyntaxName={useCodeSyntaxName}
                exportUnit={exportUnit}
                rootFontSize={rootFontSize}
                appendPxToUnscoped={appendPxToUnscoped}
                dtcgCompliantValues={dtcgCompliantValues}
                useLegacyFormat={useLegacyFormat}
                onSeeOutputChange={setSeeOutput}
                onUseRowColumnPosChange={setUseRowColumnPos}
                onUseTailwindFormatChange={setUseTailwindFormat}
                onUseSingleDashSeparatorChange={setUseSingleDashSeparator}
                onUseCodeSyntaxNameChange={setUseCodeSyntaxName}
                onExportUnitChange={setExportUnit}
                onRootFontSizeChange={setRootFontSize}
                onAppendPxToUnscopedChange={setAppendPxToUnscoped}
                onDtcgCompliantValuesChange={setDtcgCompliantValues}
                onUseLegacyFormatChange={setUseLegacyFormat}
            />
        </>
    );

    const actions = (
        <ExportActions
            format={format}
            filename={filename}
            onFilenameChange={setFilename}
            variablesCount={variablesCount}
            hasExportedData={!!exportedData}
            showPreview={seeOutput}
            onExport={handleExport}
            onDownload={handleDownload}
        />
    );

    const preview = seeOutput && exportedData ? (
        <OutputPreview
            exportedData={exportedData}
            editorType={editorType}
            format={format}
            onSelectToCopy={handleSelectToCopy}
        />
    ) : null;

    return (
        <PluginDialogShell>
            <ExportLayout 
                editorType={editorType}
                children={formControls}
                preview={preview}
                actions={actions}
            />
        </PluginDialogShell>
    );
};

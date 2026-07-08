import React, { useState } from "react";
import { Flex, Text, Button, Link } from "figma-kit";
import { copyToClipboard } from "../utils/clipboard";
import { renderCodeLines } from "../utils/highlightCode";
import { ExportFile, OutputFormats } from "../types.d";

interface OutputPreviewProps {
    exportedData: string;
    files?: ExportFile[] | null;
    usedExtendedCollections?: boolean;
    editorType?: string;
    format?: OutputFormats;
    onSelectToCopy: () => void;
}

/**
 * Code preview component with select-to-copy functionality.
 * When multiple files are provided, renders a tab selector above the preview.
 */
export const OutputPreview: React.FC<OutputPreviewProps> = ({
    exportedData,
    files,
    usedExtendedCollections = false,
    editorType = 'dev',
    format,
    onSelectToCopy
}) => {
    const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [activeFileIndex, setActiveFileIndex] = useState(0);

    const isMultiFile = !!files && files.length > 1;
    const activeContent = isMultiFile ? files[activeFileIndex].content : exportedData;

    const handleCopy = async () => {
        try {
            const success = await copyToClipboard(activeContent);
            setCopyStatus(success ? 'success' : 'error');

            // Reset status after 2 seconds
            setTimeout(() => setCopyStatus('idle'), 2000);
        } catch (error) {
            console.error('Copy failed:', error);
            setCopyStatus('error');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    if (!activeContent) return null;

    return (
        <Flex
            direction="column"
            gap="2"
            style={{
                flex: "2 1 300px",
                minWidth: 0,
                minHeight: 0,
                maxWidth: editorType === 'design' ? "454px" : "100%",
            }}
        >
            <Text>Code Preview</Text>
            {usedExtendedCollections && (
                <Text style={{ color: 'var(--figma-color-text-secondary)' }}>
                    🧪 <strong>Beta:</strong> This export includes Extended (Enterprise) collections.
                    Hierarchy-aware export is new — overridden values keep their own value,
                    inherited values are exported as a reference into the parent collection.
                    Spotted something off?{' '}
                    <Link target="_blank" href="https://github.com/atropical/varvar/issues">Let us know ↗</Link>
                </Text>
            )}
            {isMultiFile && (
                <Flex direction="row" gap="2" style={{ flexWrap: 'wrap' }}>
                    {files.map((file, index) => (
                        <Button
                            key={file.filename}
                            variant={index === activeFileIndex ? "primary" : "secondary"}
                            onClick={() => setActiveFileIndex(index)}
                        >
                            {file.filename}.json
                        </Button>
                    ))}
                </Flex>
            )}
            <Flex
                direction="column"
                gap="2"
                style={{
                    position: 'relative',
                    border: 'var(--figma-color-border)',
                    borderRadius: 4,
                    padding: 8,
                    backgroundColor: 'rgba(0,0,0,.25)',
                    minWidth: 0,
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    flex: '1 1 auto',
                    minHeight: 0,
                }}
            >
                <Flex direction="column" style={{ minWidth: 0, maxWidth: '100%', flex: 1, minHeight: 0 }}>
                    <Flex
                        direction="row"
                        gap="2"
                        style={{
                            alignSelf: 'end',
                            position: 'sticky',
                            top: 4,
                            right: 4,
                            backdropFilter: 'blur(4px)'
                        }}
                    >
                        <Button
                            variant="secondary"
                            onClick={handleCopy}
                            disabled={copyStatus !== 'idle'}
                        >
                            {copyStatus === 'success' ? '✓ Copied!' :
                             copyStatus === 'error' ? '✗ Failed' : 'Copy'}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={onSelectToCopy}
                        >
                            Select Result
                        </Button>
                    </Flex>
                    <Text
                        style={{
                            marginTop: '-2rem',
                            display: 'flex',
                            flex: 1,
                            minHeight: 0,
                        }}
                    >
                        <pre
                            key={activeFileIndex}
                            id="varvar-exported-output"
                            style={{
                                flex: 1,
                                minHeight: 0,
                                overflowX: 'auto',
                                overflowY: 'auto',
                                maxWidth: '100%',
                                boxSizing: 'border-box',
                                margin: 0,
                            }}
                            contentEditable
                            spellCheck="false"
                            suppressContentEditableWarning
                        >
                            {renderCodeLines(activeContent.toString(), format)}
                        </pre>
                    </Text>
                </Flex>
            </Flex>
        </Flex>
    );
};

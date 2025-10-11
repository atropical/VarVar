import React, { useState } from "react";
import { Flex, Text, Button } from "figma-kit";
import { copyToClipboard } from "../utils/clipboard";

interface OutputPreviewProps {
    exportedData: string;
    editorType?: string;
    onSelectToCopy: () => void;
}

/**
 * Code preview component with select-to-copy functionality
 */
export const OutputPreview: React.FC<OutputPreviewProps> = ({ 
    exportedData, 
    editorType = 'dev',
    onSelectToCopy 
}) => {
    const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleCopy = async () => {
        try {
            const success = await copyToClipboard(exportedData);
            setCopyStatus(success ? 'success' : 'error');
            
            // Reset status after 2 seconds
            setTimeout(() => setCopyStatus('idle'), 2000);
        } catch (error) {
            console.error('Copy failed:', error);
            setCopyStatus('error');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    if (!exportedData) return null;

    return (
        <Flex direction="column" gap="2" style={{ flex: "2 0 300px", maxWidth: editorType === 'design' ? "454px" : undefined }}>
            <Text>Code Preview</Text>
            <Flex 
                direction="column"
                gap="2"
                style={{
                    position: 'relative',
                    border: 'var(--figma-color-border)',
                    borderRadius: 4,
                    padding: 8,
                    backgroundColor: 'rgba(0,0,0,.25)',
                }}
            >
                <Flex direction="column">
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
                    <Text style={{ marginTop: '-2rem' }}>
                        <pre
                            id="varvar-exported-output"
                            style={{ overflow: 'auto' }}
                            contentEditable
                            spellCheck="false"
                        >
                            {exportedData.toString()}
                        </pre>
                    </Text>
                </Flex>
            </Flex>
        </Flex>
    );
};

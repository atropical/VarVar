import React from "react";
import { Flex, Text, Button } from "figma-kit";

interface OutputPreviewProps {
    exportedData: string;
    onSelectToCopy: () => void;
}

/**
 * Code preview component with select-to-copy functionality
 */
export const OutputPreview: React.FC<OutputPreviewProps> = ({ 
    exportedData, 
    onSelectToCopy 
}) => {
    if (!exportedData) return null;

    return (
        <Flex direction="column" gap="2">
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
                    <Button
                        variant="secondary"
                        onClick={onSelectToCopy}
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
                    <Text style={{ marginTop: '-2rem' }}>
                        <pre
                            id="varvar-exported-output"
                            style={{ overflowX: 'auto' }}
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

import React from "react";
import { Flex, Text, Input, Label } from "figma-kit";
import { OutputFormats } from "../types.d";

interface FilenameInputProps {
    format: OutputFormats;
    filename: string;
    onFilenameChange: (filename: string) => void;
}

/**
 * Reusable filename input component with format-specific validation
 */
export const FilenameInput: React.FC<FilenameInputProps> = ({ 
    format, 
    filename, 
    onFilenameChange 
}) => {
    const handleFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        if (!value) {
            value = `exported_variables`;
        }
        // Remove format extension if present
        const cleanValue = value.replace(`.${format}`, '');
        onFilenameChange(cleanValue);
    };

    return (
        <Flex gap="2" direction="column">
            <Label style={{ color: 'var(--figma-color-text-secondary)' }} htmlFor="varvar-filename">
                Filename
            </Label>
            <Input
                id="varvar-filename"
                placeholder={`Ex.: export_variables.${format}`}
                value={`${filename}.${format}`}
                required
                selectOnClick
                pattern={`^[a-zA-Z0-9_-]+\\.(${format})$`}
                title={`Enter a valid filename with .${format} extension`}
                onChange={handleFilenameChange}
            />
        </Flex>
    );
};

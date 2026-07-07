import React, { useRef } from "react";
import { Flex, Text, Label, Button } from "figma-kit";

interface FileImportInputProps {
    fileNames: string[];
    onFilesSelected: (fileNames: string[], contents: string[]) => void;
}

/**
 * File picker for uploading one or more previously-exported VarVar JSON
 * files. figma-kit has no file-input equivalent, so this wraps a hidden
 * native `<input type="file">` and drives it from a figma-kit Button to
 * match the rest of the plugin's UI. Reads each selected file as text and
 * hands the raw contents up — parsing/validation happens in the plugin
 * sandbox, not the UI.
 */
export const FileImportInput: React.FC<FileImportInputProps> = ({
    fileNames,
    onFilesSelected
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const fileList = Array.from(files);
        const contents = await Promise.all(fileList.map((file) => file.text()));
        onFilesSelected(fileList.map((file) => file.name), contents);
    };

    return (
        <Flex gap="2" direction="column">
            <Label style={{ color: 'var(--figma-color-text-secondary)' }} htmlFor="varvar-import-file">
                JSON file
            </Label>

            <input
                ref={inputRef}
                id="varvar-import-file"
                type="file"
                accept="application/json,.json"
                multiple
                onChange={handleChange}
                style={{ display: "none" }}
            />

            <Button
                variant="secondary"
                size="medium"
                fullWidth={true}
                onClick={() => inputRef.current?.click()}
            >
                {fileNames.length > 0 ? "Choose different file(s)…" : "Choose JSON file(s)…"}
            </Button>

            {fileNames.length > 0 && (
                <Flex direction="column" gap="1" style={{
                    padding: "0.5rem",
                    border: "1px solid var(--figma-color-border)",
                    borderRadius: "4px",
                }}>
                    {fileNames.map((name) => (
                        <Text key={name} style={{ color: 'var(--figma-color-text-secondary)' }}>
                            {name}
                        </Text>
                    ))}
                </Flex>
            )}
        </Flex>
    );
};

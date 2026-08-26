import React from "react";
import { Flex, Switch, Label } from "figma-kit";
import { OutputFormats } from "../types.d";
import { HelpTip } from "./HelpTip";

interface ExportOptionsProps {
    format: OutputFormats;
    seeOutput: boolean;
    useRowColumnPos: boolean;
    useTailwindFormat?: boolean;
    useSingleDashSeparator?: boolean;
    useCodeSyntaxName?: boolean;
    appendPxToUnscoped?: boolean;
    useLegacyFormat?: boolean;
    onSeeOutputChange: (seeOutput: boolean) => void;
    onUseRowColumnPosChange: (useRowColumnPos: boolean) => void;
    onUseTailwindFormatChange?: (useTailwindFormat: boolean) => void;
    onUseSingleDashSeparatorChange?: (useSingleDashSeparator: boolean) => void;
    onUseCodeSyntaxNameChange?: (useCodeSyntaxName: boolean) => void;
    onAppendPxToUnscopedChange?: (appendPxToUnscoped: boolean) => void;
    onUseLegacyFormatChange?: (useLegacyFormat: boolean) => void;
}

/**
 * Format-specific export options component
 */
export const ExportOptions: React.FC<ExportOptionsProps> = ({
    format,
    seeOutput,
    useRowColumnPos,
    useTailwindFormat = false,
    useSingleDashSeparator = true,
    useCodeSyntaxName = false,
    appendPxToUnscoped = false,
    useLegacyFormat = false,
    onSeeOutputChange,
    onUseRowColumnPosChange,
    onUseTailwindFormatChange,
    onUseSingleDashSeparatorChange,
    onUseCodeSyntaxNameChange,
    onAppendPxToUnscopedChange,
    onUseLegacyFormatChange
}) => {
    return (
        <Flex gap="2" direction="column">
            <Label style={{ color: 'var(--figma-color-text-secondary)' }}>
                Options
            </Label>
            
            {/* CSV-specific option */}
            {format === OutputFormats.CSV && (
                <Flex gap="2">
                    <Switch 
                        id="varvar-export-row-column-pos" 
                        onCheckedChange={onUseRowColumnPosChange} 
                        checked={useRowColumnPos}
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-row-column-pos">
                        Use row &amp; column positions (i.e.: <code>=E7</code>) for linked vars
                    </Label>
                </Flex>
            )}
            
            {/* CSS-specific option, with its Tailwind-only sub-options nested under it */}
            {format === OutputFormats.CSS && onUseTailwindFormatChange && (
                <Flex gap="2" direction="column">
                    <Flex gap="2">
                        <Switch
                            id="varvar-export-tailwind-format"
                            onCheckedChange={onUseTailwindFormatChange}
                            checked={useTailwindFormat}
                            style={{ flexShrink: 0 }}
                        />
                        <Label htmlFor="varvar-export-tailwind-format">
                            Export as Tailwind CSS (v4)
                        </Label>
                        <HelpTip content="🧪 BETA: Exports the variables as Tailwind CSS (v4) format. It will also include the @theme directive and @custom-variant directives." />
                    </Flex>

                    {/* Tailwind-only option: how Figma groups are joined in the variable name.
                        Indented purely visually — each Switch keeps its own label association. */}
                    {useTailwindFormat && onUseSingleDashSeparatorChange && (
                        <Flex gap="2" direction="column" style={{ paddingLeft: '24px', borderLeft: '1px solid var(--figma-color-border)', marginLeft: '11px' }}>
                            <Flex gap="2">
                                <Switch
                                    id="varvar-export-single-dash-separator"
                                    onCheckedChange={onUseSingleDashSeparatorChange}
                                    checked={useSingleDashSeparator}
                                    style={{ flexShrink: 0 }}
                                />
                                <Label htmlFor="varvar-export-single-dash-separator">
                                    Join groups with a single dash (<code>-</code> instead of <code>--</code>)
                                </Label>
                                <HelpTip content={"Figma groups (the \"/\" in a variable name) are joined with a single dash, so \"color/brand/500\" becomes --color-brand-500 instead of --color-brand--500. Tailwind IntelliSense only suggests theme variables written with single dashes, so with this off the variables can only be used through var(--...), not in @apply or class names. Dashes you typed into the Figma name yourself are always kept as-is, so an intentional --text-xl--line-height still works."} />
                            </Flex>
                        </Flex>
                    )}
                </Flex>
            )}

            {/* CSS/JS option: let Figma's "Code Syntax" (Web) name the emitted variable */}
            {(format === OutputFormats.CSS || format === OutputFormats.JS) && onUseCodeSyntaxNameChange && (
                <Flex gap="2">
                    <Switch
                        id="varvar-export-code-syntax-name"
                        onCheckedChange={onUseCodeSyntaxNameChange}
                        checked={useCodeSyntaxName}
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-code-syntax-name">
                        Use Web code syntax as variable name
                    </Label>
                    <HelpTip content={
                        format === OutputFormats.CSS
                            ? "Variables that have a Web \"Code Syntax\" set in Figma are exported under that name instead of the one derived from the Figma variable name — both where they are declared and in every var(--...) that points at them. A leading -- is kept as-is rather than doubled. Overrides that can't be a CSS custom property name (whitespace, \";\", \"{\", \"}\", \":\" or a comment) are ignored, and the exported file says which ones."
                            : "Variables that have a Web \"Code Syntax\" set in Figma are exported under that name instead of the one derived from the Figma variable name — both where they are declared and in every reference to them. A leading -- is dropped and the name is camelCased when it isn't already a valid JavaScript identifier; if it still can't be one, the derived name is used."
                    } />
                </Flex>
            )}

            {/* CSS/Tailwind option: give undecided numeric values a px unit */}
            {format === OutputFormats.CSS && onAppendPxToUnscopedChange && (
                <Flex gap="2">
                    <Switch
                        id="varvar-export-append-px-unscoped"
                        onCheckedChange={onAppendPxToUnscopedChange}
                        checked={appendPxToUnscoped}
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-append-px-unscoped">
                        Append <code>px</code> to unscoped numeric values
                    </Label>
                    <HelpTip content={"Number variables that are left on Figma's default scoping (all scopes, or none at all) are exported as a bare number. With this on, they get a \"px\" unit instead. Variables scoped to something that isn't a dimension — font weight, opacity — stay unitless either way, and so do the ones already scoped to a dimension, which always get \"px\"."} />
                </Flex>
            )}

            {/* Legacy format option - JSON, CSV and JS formats changed shape in v3.0 */}
            {(format === OutputFormats.JSON || format === OutputFormats.CSV || format === OutputFormats.JS) && onUseLegacyFormatChange && (
                <Flex gap="2">
                    <Switch
                        id="varvar-export-legacy-format"
                        onCheckedChange={onUseLegacyFormatChange}
                        checked={useLegacyFormat}
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-legacy-format">
                        Export using legacy format (v2.x)
                    </Label>
                    <HelpTip content={
                        format === OutputFormats.JSON
                            ? "Exports using the pre-3.0 JSON shape: raw $type, no px units on numeric values, and a single flat file even if you use Enterprise extended collections."
                            : format === OutputFormats.CSV
                                ? "Exports using the pre-3.0 CSV shape: drops the \"DTCG Type\" and \"Inherited\" columns added in 3.0."
                                : "Exports using the pre-3.0 JS shape: drops the \"dtcgType\" and \"inherited\" fields added to each value in 3.0."
                    } />
                </Flex>
            )}

            {/* Preview option - available for all formats */}
            <Flex gap="2">
                <Switch 
                    id="varvar-preview-output" 
                    onCheckedChange={onSeeOutputChange} 
                    checked={seeOutput} 
                    style={{ flexShrink: 0 }}
                />
                <Label htmlFor="varvar-preview-output">
                    Preview output
                </Label>
            </Flex>
        </Flex>
    );
};

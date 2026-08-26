import React from "react";
import { Flex, Switch, Label, Select, Input } from "figma-kit";
import { OutputFormats } from "../types.d";
import type { ExportUnit } from "../types.d";
import { EXPORT_UNITS } from "../utils/units";
import { HelpTip } from "./HelpTip";

interface ExportOptionsProps {
    format: OutputFormats;
    seeOutput: boolean;
    useRowColumnPos: boolean;
    useTailwindFormat?: boolean;
    useSingleDashSeparator?: boolean;
    useCodeSyntaxName?: boolean;
    exportUnit?: ExportUnit;
    rootFontSize?: string;
    appendPxToUnscoped?: boolean;
    dtcgCompliantValues?: boolean;
    useLegacyFormat?: boolean;
    onSeeOutputChange: (seeOutput: boolean) => void;
    onUseRowColumnPosChange: (useRowColumnPos: boolean) => void;
    onUseTailwindFormatChange?: (useTailwindFormat: boolean) => void;
    onUseSingleDashSeparatorChange?: (useSingleDashSeparator: boolean) => void;
    onUseCodeSyntaxNameChange?: (useCodeSyntaxName: boolean) => void;
    onExportUnitChange?: (exportUnit: ExportUnit) => void;
    onRootFontSizeChange?: (rootFontSize: string) => void;
    onAppendPxToUnscopedChange?: (appendPxToUnscoped: boolean) => void;
    onDtcgCompliantValuesChange?: (dtcgCompliantValues: boolean) => void;
    onUseLegacyFormatChange?: (useLegacyFormat: boolean) => void;
}

/** Help text for the group-separator switch, which now serves both CSS outputs. */
const SEPARATOR_HELP = "Figma groups (the \"/\" in a variable name) are joined with a single dash, so \"color/brand/500\" becomes --color-brand-500 instead of --color-brand--500. Tailwind IntelliSense only suggests theme variables written with single dashes, so with this off the variables can only be used through var(--...), not in @apply or class names — which is also why plain CSS keeps the double dash by default. Dashes you typed into the Figma name yourself are always kept as-is, so an intentional --text-xl--line-height still works.";

/**
 * Help text for the unit dropdown, per format. Only CSS/Tailwind and JSON offer
 * it: CSV and JS both emit bare numbers by design.
 */
const unitHelp = (format: OutputFormats): string => {
    const shared = "Number variables Figma scopes as a dimension are exported with this unit. Variables scoped to something that isn't a dimension (font weight, opacity) stay unitless whatever you pick here. \"rem\" divides the number by the root font size, so 32 becomes 2rem. Only \"px\" and \"rem\" are offered: they are the two units design tokens can express, and relative units (em, %, vw, …) depend on a context this export can't see.";
    return format === OutputFormats.CSS
        ? shared
        : `${shared} "None" emits a bare number, tagged as a plain number rather than a dimension.`;
};

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
    exportUnit = "px",
    rootFontSize = "16",
    appendPxToUnscoped = false,
    dtcgCompliantValues = true,
    useLegacyFormat = false,
    onSeeOutputChange,
    onUseRowColumnPosChange,
    onUseTailwindFormatChange,
    onUseSingleDashSeparatorChange,
    onUseCodeSyntaxNameChange,
    onExportUnitChange,
    onRootFontSizeChange,
    onAppendPxToUnscopedChange,
    onDtcgCompliantValuesChange,
    onUseLegacyFormatChange
}) => {
    // The group separator applies to both CSS outputs (#23), so it is rendered
    // once and placed either inside the Tailwind sub-group or at the top level.
    const separatorSwitch = format === OutputFormats.CSS && onUseSingleDashSeparatorChange ? (
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
            <HelpTip content={SEPARATOR_HELP} />
        </Flex>
    ) : null;

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

                    {/* With Tailwind on, the separator switch belongs to the Tailwind
                        sub-group (single dashes are what IntelliSense needs), so it is
                        indented under it. Indentation is purely visual — each Switch
                        keeps its own label association. */}
                    {useTailwindFormat && separatorSwitch && (
                        <Flex gap="2" direction="column" style={{ paddingLeft: '24px', borderLeft: '1px solid var(--figma-color-border)', marginLeft: '11px' }}>
                            {separatorSwitch}
                        </Flex>
                    )}
                </Flex>
            )}

            {/* With Tailwind off the separator is a plain-CSS option in its own right (#23) */}
            {!useTailwindFormat && separatorSwitch}

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

            {/* CSS/Tailwind and JSON option: the unit numeric dimensions are exported with.
                Hidden behind the legacy switch for JSON, whose v2.x shape predates units and
                always emits a bare number. JS is deliberately absent: its values are real
                JavaScript literals that consumers read as numbers, so it always emits bare
                numbers, exactly as it did before this option existed. */}
            {(format === OutputFormats.CSS
                || (format === OutputFormats.JSON && !useLegacyFormat)) && onExportUnitChange && (
                <Flex gap="2" direction="column">
                    <Flex gap="2" align="center">
                        <Label htmlFor="varvar-export-unit">
                            Unit for numeric values
                        </Label>
                        <HelpTip content={unitHelp(format)} />
                    </Flex>
                    <Flex gap="2" align="center" wrap="wrap">
                        <Select.Root
                            value={exportUnit}
                            onValueChange={(value) => onExportUnitChange(value as ExportUnit)}
                        >
                            <Select.Trigger id="varvar-export-unit" style={{ minWidth: '148px' }} />
                            {/* Portalled so the popup isn't clipped by the scrolling options column */}
                            <Select.Content portal position="popper" sideOffset={4}>
                                {EXPORT_UNITS.map((unit) => (
                                    <Select.Item key={unit.value} value={unit.value}>
                                        {unit.label}
                                    </Select.Item>
                                ))}
                            </Select.Content>
                        </Select.Root>

                        {exportUnit === "rem" && onRootFontSizeChange && (
                            <Flex gap="2" align="center">
                                <Label htmlFor="varvar-root-font-size" style={{ whiteSpace: 'nowrap' }}>
                                    Root font size
                                </Label>
                                <Input
                                    id="varvar-root-font-size"
                                    type="number"
                                    min="1"
                                    step="any"
                                    value={rootFontSize}
                                    selectOnClick
                                    onChange={(event) => onRootFontSizeChange(event.target.value)}
                                    style={{ width: '72px' }}
                                />
                                <Label htmlFor="varvar-root-font-size">px</Label>
                                <HelpTip content={`Every ${exportUnit} value is the Figma number divided by this. Defaults to 16, the browser default; an empty or invalid entry falls back to 16 rather than exporting a broken value.`} />
                            </Flex>
                        )}
                    </Flex>
                </Flex>
            )}

            {/* Companion to the unit dropdown, restored from 4.4. The dropdown says
                *which* unit a dimension gets; this says *whether* variables left on
                Figma's default scoping count as dimensions at all. Off by default. */}
            {(format === OutputFormats.CSS
                || (format === OutputFormats.JSON && !useLegacyFormat)) && onAppendPxToUnscopedChange && (
                <Flex gap="2">
                    <Switch
                        id="varvar-export-append-px-unscoped"
                        onCheckedChange={onAppendPxToUnscopedChange}
                        checked={appendPxToUnscoped}
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-append-px-unscoped">
                        Apply the unit to unscoped numeric values
                    </Label>
                    <HelpTip content={"Number variables that are left on Figma's default scoping (all scopes, or none at all) are exported as a bare number. With this on, they get the unit above instead. Variables scoped to something that isn't a dimension — font weight, opacity — stay unitless either way, and so do the ones already scoped to a dimension, which always get the unit."} />
                </Flex>
            )}

            {/* JSON-only: the shape a unit-carrying value is written in. */}
            {format === OutputFormats.JSON && !useLegacyFormat && onDtcgCompliantValuesChange && (
                <Flex gap="2">
                    <Switch
                        id="varvar-export-dtcg-compliant-values"
                        onCheckedChange={onDtcgCompliantValuesChange}
                        checked={dtcgCompliantValues}
                        style={{ flexShrink: 0 }}
                    />
                    <Label htmlFor="varvar-export-dtcg-compliant-values">
                        DTCG-compliant values
                    </Label>
                    <HelpTip content={"The Design Tokens spec requires a dimension to be an object with a numeric value and a unit, so 16px is written as { \"value\": 16, \"unit\": \"px\" }. Turn this off to get the \"16px\" string earlier versions of this plugin emitted, for consumers built against that. Values without a unit are bare numbers either way."} />
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

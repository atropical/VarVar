import React from "react";
import { Flex, Switch, Label, Select, Input, Text } from "figma-kit";
import { OutputFormats, MessageTypes } from "../types.d";
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

/**
 * The Design Tokens Community Group format spec the DTCG option follows.
 *
 * Deliberately the stable 2025.10 publication, not the preview draft at
 * /TR/drafts/format/ — that one states "Do not attempt to implement this
 * version of the specification. Do not reference this version as
 * authoritative in any way." Both currently agree on the dimension,
 * number and fontWeight shapes the exporter emits.
 */
const DTCG_SPEC_URL = "https://www.designtokens.org/TR/2025.10/format/";

/**
 * Left inset that lines a footnote up with the label of the switch it belongs
 * to: the Switch is 2rem wide and the row's gap is 0.5rem.
 */
const FOOTNOTE_INDENT = '40px';

/**
 * A muted, small explanatory line rendered directly under the option it
 * describes. Used instead of a `?` tooltip wherever the explanation is longer
 * than a hover tooltip can comfortably hold.
 */
const Footnote: React.FC<{ children: React.ReactNode; indent?: boolean }> = ({ children, indent = true }) => (
    <Text
        size="small"
        block
        style={{
            color: 'var(--figma-color-text-secondary)',
            paddingLeft: indent ? FOOTNOTE_INDENT : undefined,
            marginTop: '-4px'
        }}
    >
        {children}
    </Text>
);

/**
 * A plugin iframe can't navigate the browser itself, so a link asks the plugin
 * sandbox to do it: the sandbox answers `MessageTypes.OPEN_EXTERNAL` with
 * `figma.openExternal(url)`. Rendered as a real <button> so it stays keyboard
 * reachable, styled to read as a link.
 */
const ExternalLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
    <button
        type="button"
        onClick={() => {
            parent.postMessage({ pluginMessage: { type: MessageTypes.OPEN_EXTERNAL, url: href } }, "*");
        }}
        style={{ appearance: 'none', background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'var(--figma-color-text-brand)', textDecoration: 'underline', cursor: 'pointer' }}
    >
        {children}
    </button>
);

/**
 * Footnote text for the unit dropdown, per format. Only CSS/Tailwind and JSON
 * offer it: CSV and JS both emit bare numbers by design.
 */
const unitFootnote = (format: OutputFormats): string => {
    const shared = "Applies to number variables Figma scopes as a dimension; anything scoped otherwise (font weight, opacity) stays unitless. \"rem\" divides by the root font size, so 32 becomes 2rem.";
    return format === OutputFormats.CSS
        ? shared
        : `${shared} "None" emits a bare number, tagged as a number rather than a dimension.`;
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
    const showUnitOptions = format === OutputFormats.CSS
        || (format === OutputFormats.JSON && !useLegacyFormat);

    return (
        <Flex gap="2" direction="column">
            <Label style={{ color: 'var(--figma-color-text-secondary)' }}>
                Options
            </Label>

            {/* Preview option - available for all formats, and first so the one
                option every format shares doesn't move around between them. */}
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

            {/* CSS-specific option */}
            {format === OutputFormats.CSS && onUseTailwindFormatChange && (
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
                    <HelpTip content="🧪 Beta. Adds the @theme and @custom-variant directives." />
                </Flex>
            )}

            {/* The group separator serves both CSS outputs (#23), so it sits at the
                same level whether or not Tailwind is on. */}
            {format === OutputFormats.CSS && onUseSingleDashSeparatorChange && (
                <>
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
                    </Flex>
                    <Footnote>
                        “color/brand/500” becomes <code>--color-brand-500</code>, not <code>--color-brand--500</code>.
                        Tailwind IntelliSense only suggests single-dash names. Dashes typed into the Figma name are
                        kept as-is.
                    </Footnote>
                </>
            )}

            {/* CSS/JS option: let Figma's "Code Syntax" (Web) name the emitted variable */}
            {(format === OutputFormats.CSS || format === OutputFormats.JS) && onUseCodeSyntaxNameChange && (
                <>
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
                    </Flex>
                    <Footnote>
                        {format === OutputFormats.CSS
                            ? "Variables with a Web “Code Syntax” set in Figma are declared and referenced under that name. Names that can't be a CSS custom property are ignored, and the exported file says which."
                            : "Variables with a Web “Code Syntax” set in Figma are declared and referenced under that name, camelCased if it isn't a valid JavaScript identifier. If it still can't be one, the derived name is used."}
                    </Footnote>
                </>
            )}

            {/* CSS/Tailwind and JSON option: the unit numeric dimensions are exported with.
                Hidden behind the legacy switch for JSON, whose v2.x shape predates units and
                always emits a bare number. JS is deliberately absent: its values are real
                JavaScript literals that consumers read as numbers, so it always emits bare
                numbers, exactly as it did before this option existed. */}
            {showUnitOptions && onExportUnitChange && (
                <Flex gap="2" direction="column">
                    <Label htmlFor="varvar-export-unit">
                        Unit for numeric values
                    </Label>
                    <Flex gap="2" align="center" wrap="wrap">
                        <Select.Root
                            value={exportUnit}
                            onValueChange={(value) => onExportUnitChange(value as ExportUnit)}
                        >
                            {/* Compact by design: the widest option is "None (bare number)" */}
                            <Select.Trigger id="varvar-export-unit" style={{ width: '160px', flexShrink: 0 }} />
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
                                <HelpTip content="Defaults to 16, the browser default. An empty or invalid entry falls back to 16." />
                            </Flex>
                        )}
                    </Flex>
                    <Footnote indent={false}>{unitFootnote(format)}</Footnote>
                </Flex>
            )}

            {/* Companion to the unit dropdown, restored from 4.4. The dropdown says
                *which* unit a dimension gets; this says *whether* variables left on
                Figma's default scoping count as dimensions at all. Off by default. */}
            {showUnitOptions && onAppendPxToUnscopedChange && (
                <>
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
                    </Flex>
                    <Footnote>
                        Number variables left on Figma's default scoping (all scopes, or none) export as bare
                        numbers; with this on they get the unit above. Non-dimension scopes stay unitless either way.
                    </Footnote>
                </>
            )}

            {/* JSON-only: the shape a unit-carrying value is written in. */}
            {format === OutputFormats.JSON && !useLegacyFormat && onDtcgCompliantValuesChange && (
                <>
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
                    </Flex>
                    <Footnote>
                        The <ExternalLink href={DTCG_SPEC_URL}>Design Tokens spec</ExternalLink> writes a dimension
                        as <code>{'{ "value": 16, "unit": "px" }'}</code>. Turn this off for the “16px” string
                        earlier versions emitted. Values without a unit are bare numbers either way.
                    </Footnote>
                </>
            )}

            {/* Legacy format option, last - JSON, CSV and JS formats changed shape in v3.0 */}
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
                            ? "The pre-3.0 JSON shape: raw $type, no units, and one flat file even with extended collections."
                            : format === OutputFormats.CSV
                                ? "The pre-3.0 CSV shape: no “DTCG Type” or “Inherited” columns."
                                : "The pre-3.0 JS shape: no “dtcgType” or “inherited” fields on each value."
                    } />
                </Flex>
            )}
        </Flex>
    );
};

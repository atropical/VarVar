/**
 * The separator inserted in place of Figma's group delimiter (`/`) when the
 * caller doesn't ask for anything else. Kept at `--` so plain CSS output is
 * unchanged from previous versions.
 */
export const DEFAULT_GROUP_SEPARATOR = "--";

/**
 * The separator that keeps names compatible with Tailwind IntelliSense, which
 * only suggests theme variables whose segments are joined by a single dash.
 */
export const SINGLE_GROUP_SEPARATOR = "-";

/**
 * Converts a string to a CSS variable name
 *
 * Only the group delimiter (`/`) is rewritten to `groupSeparator`; dashes the
 * user typed into the Figma name itself are passed through untouched, so an
 * intentional Tailwind-style name such as `text-xl--line-height` survives.
 *
 * @param {string} string - The string to convert
 * @param {boolean} prependDoubleDash - Whether to prepend a double dash
 * @param {string} groupSeparator - What to replace Figma's `/` group delimiter with
 * @returns {string} The CSS variable name
 */
export const toCssVar = (
    string: string,
    prependDoubleDash: boolean = false,
    groupSeparator: string = DEFAULT_GROUP_SEPARATOR
) => {
    string = (prependDoubleDash ? `--${string}` : string)
                .replace(/\//g, groupSeparator)
                .replace(/\s/g, '-')
                .replace(/\./g, '_')
                .toLowerCase();
    return string;
}

/**
 * Converts a string to a filesystem-safe kebab-case slug
 * @param {string} string - The string to convert
 * @returns {string} The slugified string
 */
export const toFileSlug = (string: string) => {
    return string
        .trim()
        .toLowerCase()
        .replace(/[\s/]+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

/**
 * Converts a string to camel case
 * @param {string} string - The string to convert
 * @param {boolean} detectAllCaps - Whether to detect all caps
 * @returns {string} The camel case string
 */
export const toCamelCase = (string: string, detectAllCaps = true) => {

    if (detectAllCaps && /^[A-Z][A-Z0-9_\s]*$/.test(string)) {
        return string.replace(/\s+/g, '');
    }

    return string
        .trim()
        .replace(/(?:^\w|[A-Z]|\b\w|\s+\w|\s*\d+)/g, (match, index) => {
            if (index === 0) return match.toLowerCase();
            if (/^\s+\w/.test(match)) return match.trim().toUpperCase();
            if (/\s*\d+/.test(match)) return match.trim();
            return match.toUpperCase();
        })
        .replace(/-/g, '')
        .replace(/\./g, '_');
}

/**
 * Records that `sourceName` (the original Figma variable name) was emitted as
 * the CSS custom property `emittedName`, so collisions can be reported later.
 * @param registry - Map of emitted name -> the set of Figma names that produced it
 * @param emittedName - The CSS custom property name that was written out
 * @param sourceName - The original Figma variable name
 */
export const recordEmittedVarName = (
    registry: Map<string, Set<string>>,
    emittedName: string,
    sourceName: string
) => {
    const sources = registry.get(emittedName);
    if (sources) {
        sources.add(sourceName);
    } else {
        registry.set(emittedName, new Set([sourceName]));
    }
}

/**
 * Builds a CSS comment listing every emitted variable name that more than one
 * distinct Figma variable name collapsed into. Such collisions are silently
 * deduped by the exporters' Sets, so they are surfaced in the output instead of
 * throwing.
 * @param registry - Map filled in by {@link recordEmittedVarName}
 * @returns The warning comment, or an empty string when there are no collisions
 */
export const buildCollisionComment = (registry: Map<string, Set<string>>): string => {
    const collisions = Array.from(registry.entries())
        .filter(([, sources]) => sources.size > 1);

    if (collisions.length === 0) {
        return '';
    }

    const lines = collisions.map(([emittedName, sources]) =>
        `   ${emittedName}  <-  ${Array.from(sources).map((source) => `"${source}"`).join(', ')}`
    );

    return [
        '/* ⚠️ Naming collision: different Figma variable names produced the same CSS',
        '   variable name, so only one declaration per name survives below.',
        '   Rename the variables in Figma to keep them distinct:',
        ...lines,
        '*/'
    ].join('\n');
}

/**
 * State shared by every name resolution in a single export run: whether the
 * user asked for Web code syntax to drive the emitted names, and where
 * unusable overrides are collected so they can be reported in the output.
 */
export interface NameOptions {
    useCodeSyntaxName: boolean;
    rejectedCodeSyntax: Map<string, string>;
}

/**
 * Characters that can't appear in a CSS custom property name without breaking
 * the declaration it lands in: any whitespace, the declaration/blocks
 * delimiters, and a comment opener.
 */
const UNSAFE_CSS_VAR_NAME = /[\s;{}:]|\/\*/;

/**
 * Resolves the CSS custom property name a variable's Web code syntax asks for.
 *
 * Figma users commonly type the override with the leading `--` already in
 * place (`--my-token`), so it's only prefixed when it isn't there. The value
 * is used verbatim otherwise — that's the point of the override — beyond
 * rejecting anything that couldn't be a custom property name at all.
 *
 * @param webCodeSyntax - The variable's `codeSyntax.WEB` value, if any
 * @returns The `--`-prefixed name, or `undefined` when there is no usable override
 */
export const toCodeSyntaxCssVar = (webCodeSyntax: string | undefined): string | undefined => {
    if (typeof webCodeSyntax !== "string") {
        return undefined;
    }

    const trimmed = webCodeSyntax.trim();
    if (trimmed === "" || trimmed === "--" || UNSAFE_CSS_VAR_NAME.test(trimmed)) {
        return undefined;
    }

    return trimmed.startsWith("--") ? trimmed : `--${trimmed}`;
}

/**
 * Records that `sourceName`'s Web code syntax `override` couldn't be used as a
 * CSS custom property name, so the derived name was emitted instead.
 * @param registry - Map of Figma variable name -> the rejected override
 * @param sourceName - The original Figma variable name
 * @param override - The rejected `codeSyntax.WEB` value
 */
export const recordRejectedCodeSyntax = (
    registry: Map<string, string>,
    sourceName: string,
    override: string
) => {
    registry.set(sourceName, override);
}

/**
 * Builds a CSS comment listing every Web code syntax override that had to be
 * ignored because it can't be a CSS custom property name. Those variables fall
 * back to their derived name, which would otherwise be silent.
 * @param registry - Map filled in by {@link recordRejectedCodeSyntax}
 * @returns The warning comment, or an empty string when nothing was rejected
 */
export const buildCodeSyntaxComment = (registry: Map<string, string>): string => {
    if (registry.size === 0) {
        return '';
    }

    const lines = Array.from(registry.entries()).map(([sourceName, override]) =>
        `   "${sourceName}"  ->  ${override}`
    );

    return [
        '/* ⚠️ Unusable Web code syntax: these overrides contain characters that are not',
        '   allowed in a CSS custom property name (whitespace, ";", "{", "}", ":" or "/*"),',
        '   so the name derived from the Figma variable name was used instead:',
        ...lines,
        '*/'
    ].join('\n');
}

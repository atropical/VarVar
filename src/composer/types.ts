/**
 * Shared data model for the Style Composer, used on both sides of the
 * postMessage boundary. Everything here must survive structured cloning.
 *
 * A style is carried around in Figma's own shapes (Paint, Effect, LayoutGrid,
 * text properties) including their `boundVariables` aliases. The UI edits
 * those shapes directly; the sandbox re-applies the bindings through the
 * proper `setBoundVariableFor*` helpers when it writes.
 */

export type StyleKind = "PAINT" | "TEXT" | "EFFECT" | "GRID";

export const STYLE_KINDS: StyleKind[] = ["PAINT", "TEXT", "EFFECT", "GRID"];

export const STYLE_KIND_LABELS: Record<StyleKind, string> = {
    PAINT: "Colour",
    TEXT: "Text",
    EFFECT: "Effect",
    GRID: "Grid",
};

export type TextBindableField =
    | "fontFamily"
    | "fontStyle"
    | "fontWeight"
    | "fontSize"
    | "lineHeight"
    | "letterSpacing"
    | "paragraphSpacing"
    | "paragraphIndent";

/** Plain, serialisable text style properties. */
export interface TextProps {
    fontName: FontName;
    fontSize: number;
    lineHeight: LineHeight;
    letterSpacing: LetterSpacing;
    paragraphSpacing: number;
    paragraphIndent: number;
    textCase: TextCase;
    textDecoration: TextDecoration;
    leadingTrim: LeadingTrim;
    listSpacing: number;
    hangingPunctuation: boolean;
    hangingList: boolean;
    boundVariables: { [field in TextBindableField]?: VariableAlias };
}

/**
 * A style as the composer edits it. `id` is set for styles that already
 * exist in the document and absent for a style that will be created.
 * Exactly one of the payload fields matches `kind`.
 */
export interface StyleDraft {
    id?: string;
    /** Stable key for the UI list; equals `id` for existing styles. */
    key: string;
    kind: StyleKind;
    name: string;
    description: string;
    paints?: Paint[];
    text?: TextProps;
    effects?: Effect[];
    grids?: LayoutGrid[];
}

/** One mode of a collection, plus the parent mode it extends (extended collections). */
export interface CatalogMode {
    modeId: string;
    name: string;
    parentModeId?: string;
}

export interface CatalogCollection {
    id: string;
    name: string;
    defaultModeId: string;
    modes: CatalogMode[];
    /** Enterprise extended collection: its modes override the parent's values. */
    isExtension: boolean;
    parentId?: string;
    remote: boolean;
    libraryName?: string;
}

export type CatalogValue = number | string | boolean | RGBA | VariableAlias;

/**
 * A variable the picker can offer. Library variables that have not been
 * imported into the file yet have no local id: their `id` is `lib:<key>` and
 * `valuesByMode` is empty until they are imported on write.
 */
export interface CatalogVariable {
    id: string;
    key?: string;
    name: string;
    collectionId: string;
    collectionName: string;
    resolvedType: VariableResolvedDataType;
    scopes: VariableScope[];
    /** Raw values keyed by mode id, extension modes included. Aliases are kept as aliases. */
    valuesByMode: { [modeId: string]: CatalogValue };
    remote: boolean;
    /** Library variable not present in the file yet (imported by key on write). */
    unimported?: boolean;
    libraryName?: string;
}

export interface Catalog {
    collections: CatalogCollection[];
    variables: CatalogVariable[];
    /** Set when the team library could not be read (no permission, offline, …). */
    libraryError?: string;
}

/** Selected mode per collection id, for previews. Missing = collection default. */
export type ModeSelection = { [collectionId: string]: string };

/** Everything an apply run should do. Deletes take style ids. */
export interface ComposerOps {
    upserts: StyleDraft[];
    deletes: string[];
    /**
     * The full panel order to apply, as draft keys (stored and new), when the
     * user reordered styles. Omitted when the order is unchanged.
     */
    order?: { key: string; id?: string; kind: StyleKind }[];
}

export interface ComposerApplyResult {
    created: number;
    updated: number;
    deleted: number;
    reordered: boolean;
    warnings: string[];
}

export interface UsageResult {
    styleId: string;
    count: number;
    /** True when the count stopped at the display cap. */
    capped: boolean;
}

/** Field → name aliases learnt from the user, keyed by style kind. */
export type GeneratorMappings = { [kind in StyleKind]?: { [segment: string]: string } };

/** Per-file composer settings stored in plugin data. */
export interface ComposerSettings {
    mappings: GeneratorMappings;
}

export interface PreviewRequest {
    requestId: number;
    draft: StyleDraft;
    modes: ModeSelection;
    sampleText: string;
}

export interface PreviewResult {
    requestId: number;
    png?: Uint8Array;
    width?: number;
    height?: number;
    error?: string;
}

export enum ComposerMessages {
    LOAD = "COMPOSER.LOAD",
    LOADED = "COMPOSER.LOADED",
    LIBRARY_LOADED = "COMPOSER.LIBRARY_LOADED",
    PREVIEW = "COMPOSER.PREVIEW",
    PREVIEW_RESULT = "COMPOSER.PREVIEW_RESULT",
    USAGE = "COMPOSER.USAGE",
    USAGE_RESULT = "COMPOSER.USAGE_RESULT",
    APPLY = "COMPOSER.APPLY",
    APPLY_RESULT = "COMPOSER.APPLY_RESULT",
    SAVE_SETTINGS = "COMPOSER.SAVE_SETTINGS",
    DOCUMENT_CHANGED = "COMPOSER.DOCUMENT_CHANGED",
    ERROR = "COMPOSER.ERROR",
}

export type ComposerMessage =
    | { type: ComposerMessages.LOAD }
    | { type: ComposerMessages.LOADED; styles: StyleDraft[]; catalog: Catalog; settings: ComposerSettings; canEdit: boolean }
    | { type: ComposerMessages.LIBRARY_LOADED; catalog: Catalog }
    | ({ type: ComposerMessages.PREVIEW } & PreviewRequest)
    | ({ type: ComposerMessages.PREVIEW_RESULT } & PreviewResult)
    | { type: ComposerMessages.USAGE; styleId: string; cap: number }
    | ({ type: ComposerMessages.USAGE_RESULT } & UsageResult)
    | { type: ComposerMessages.APPLY; ops: ComposerOps }
    | { type: ComposerMessages.APPLY_RESULT; result: ComposerApplyResult; styles: StyleDraft[]; catalog: Catalog }
    | { type: ComposerMessages.SAVE_SETTINGS; settings: ComposerSettings }
    | { type: ComposerMessages.DOCUMENT_CHANGED }
    | { type: ComposerMessages.ERROR; error: string };

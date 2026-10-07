/// <reference types="@figma/plugin-typings" />
import type { StyleDraft, TextProps } from "./types";

/** Deep, plain copy: Figma hands out frozen objects that the UI must be able to edit. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const readTextProps = (s: TextStyle): TextProps => ({
    fontName: plain(s.fontName),
    fontSize: s.fontSize,
    lineHeight: plain(s.lineHeight),
    letterSpacing: plain(s.letterSpacing),
    paragraphSpacing: s.paragraphSpacing,
    paragraphIndent: s.paragraphIndent,
    textCase: s.textCase,
    textDecoration: s.textDecoration,
    leadingTrim: s.leadingTrim,
    listSpacing: s.listSpacing,
    hangingPunctuation: s.hangingPunctuation,
    hangingList: s.hangingList,
    boundVariables: plain(s.boundVariables ?? {}),
});

export const styleToDraft = (s: BaseStyle): StyleDraft => {
    const base = { id: s.id, key: s.id, name: s.name, description: s.description };
    switch (s.type) {
        case "PAINT":
            return { ...base, kind: "PAINT", paints: plain(s.paints) as Paint[] };
        case "TEXT":
            return { ...base, kind: "TEXT", text: readTextProps(s) };
        case "EFFECT":
            return { ...base, kind: "EFFECT", effects: plain(s.effects) as Effect[] };
        case "GRID":
            return { ...base, kind: "GRID", grids: plain(s.layoutGrids) as LayoutGrid[] };
    }
};

/** All local styles, in Figma's own panel order, grouped paint → text → effect → grid. */
export async function readLocalStyles(): Promise<StyleDraft[]> {
    const [paints, texts, effects, grids] = await Promise.all([
        figma.getLocalPaintStylesAsync(),
        figma.getLocalTextStylesAsync(),
        figma.getLocalEffectStylesAsync(),
        figma.getLocalGridStylesAsync(),
    ]);
    return [...paints, ...texts, ...effects, ...grids].map(styleToDraft);
}

/** Every variable id a set of drafts is bound to, so the catalogue can include remote ones. */
export const boundVariableIds = (drafts: StyleDraft[]): Set<string> => {
    const ids = new Set<string>();
    const collect = (bound: unknown) => {
        if (!bound || typeof bound !== "object") return;
        for (const alias of Object.values(bound as Record<string, VariableAlias | VariableAlias[]>)) {
            for (const a of Array.isArray(alias) ? alias : [alias]) {
                if (a?.id) ids.add(a.id);
            }
        }
    };
    for (const d of drafts) {
        d.paints?.forEach((p) => {
            if ("boundVariables" in p) collect(p.boundVariables);
            if ("gradientStops" in p) p.gradientStops.forEach((stop) => collect(stop.boundVariables));
        });
        d.effects?.forEach((e) => "boundVariables" in e && collect(e.boundVariables));
        d.grids?.forEach((g) => collect(g.boundVariables));
        if (d.text) collect(d.text.boundVariables);
    }
    return ids;
};

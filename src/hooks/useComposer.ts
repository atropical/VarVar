import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComposerMessages } from "../composer/types";
import type {
    Catalog, ComposerApplyResult, ComposerMessage, ComposerSettings, ModeSelection, StyleDraft, StyleKind,
} from "../composer/types";
import { indexCatalog, newDraft } from "../composer/model";
import { diffDraft } from "../composer/ops";
import type { StyleChange } from "../composer/ops";

/** Usage counts stop here and read "999+": past that the exact number stops mattering. */
export const USAGE_CAP = 999;
/** How long a usage count may take before the UI offers to stop waiting. */
const USAGE_SLOW_MS = 1500;
const PREVIEW_DEBOUNCE_MS = 300;

export interface UsageState {
    status: "counting" | "slow" | "done" | "cancelled";
    count?: number;
    capped?: boolean;
}

export interface ExactPreview {
    url?: string;
    width?: number;
    height?: number;
    error?: string;
    pending: boolean;
}

const post = (message: ComposerMessage) => parent.postMessage({ pluginMessage: message }, "*");

/**
 * Owns the composer's state and all its postMessage traffic: the styles as
 * stored (`original`) and as edited (`drafts`), deletions, the variable
 * catalogue, previews, usage counts and the apply round trip. Nothing reaches
 * the document until `apply` is called with a reviewed change set.
 */
export const useComposer = () => {
    const [loaded, setLoaded] = useState(false);
    const [canEdit, setCanEdit] = useState(false);
    const [original, setOriginal] = useState<Map<string, StyleDraft>>(new Map());
    const [drafts, setDrafts] = useState<Map<string, StyleDraft>>(new Map());
    const [order, setOrder] = useState<string[]>([]);
    const [deleted, setDeleted] = useState<Set<string>>(new Set());
    const [catalog, setCatalog] = useState<Catalog>({ collections: [], variables: [] });
    const [libraryLoading, setLibraryLoading] = useState(true);
    const [settings, setSettings] = useState<ComposerSettings>({ mappings: {} });
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [modes, setModes] = useState<ModeSelection>({});
    const [sampleText, setSampleText] = useState("The quick brown fox jumps over the lazy dog");
    const [usage, setUsage] = useState<Map<string, UsageState>>(new Map());
    const [exact, setExact] = useState<ExactPreview>({ pending: false });
    const [applying, setApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<ComposerApplyResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [externalChange, setExternalChange] = useState(false);
    /** Set once the user reorders styles, so the apply also sends the new order. */
    const [orderTouched, setOrderTouched] = useState(false);

    const previewRequest = useRef(0);
    const previewTimer = useRef<number | undefined>(undefined);
    const previewUrl = useRef<string | undefined>(undefined);
    const usageTimers = useRef<Map<string, number>>(new Map());

    const index = useMemo(() => indexCatalog(catalog), [catalog]);

    const changes = useMemo(() => {
        const list: StyleChange[] = [];
        for (const key of order) {
            const draft = drafts.get(key);
            if (!draft) continue;
            if (deleted.has(key)) {
                if (draft.id) list.push({ key, name: original.get(key)?.name ?? draft.name, kind: draft.kind, action: "delete", lines: [] });
                continue;
            }
            const change = diffDraft(original.get(key), draft, index);
            if (change) list.push(change);
        }
        return list;
    }, [order, drafts, original, deleted, index]);

    const dirtyKeys = useMemo(() => new Set(changes.map((c) => c.key)), [changes]);

    const folderOf = (d: StyleDraft) => `${d.kind}::${d.name.includes("/") ? d.name.slice(0, d.name.lastIndexOf("/")) : ""}`;

    /** Whether the stored styles' order differs from the document's. */
    const orderChanged = useMemo(() => {
        if (!orderTouched) return false;
        const stored = [...original.keys()];
        const now = order.filter((k) => original.has(k) && !deleted.has(k));
        return now.join("|") !== stored.filter((k) => !deleted.has(k)).join("|") || order.some((k) => !original.has(k));
    }, [orderTouched, order, original, deleted]);

    const resetFromDocument = useCallback((styles: StyleDraft[], nextCatalog: Catalog) => {
        const map = new Map(styles.map((s) => [s.key, s]));
        setOriginal(map);
        setDrafts(new Map(map));
        setOrder(styles.map((s) => s.key));
        setDeleted(new Set());
        setChecked(new Set());
        setCatalog(nextCatalog);
        setUsage(new Map());
        setExternalChange(false);
        setOrderTouched(false);
        setSelectedKey((key) => (key && map.has(key) ? key : styles[0]?.key ?? null));
    }, []);

    const reload = useCallback(() => {
        setLibraryLoading(true);
        post({ type: ComposerMessages.LOAD });
    }, []);

    const dirtyRef = useRef(false);
    dirtyRef.current = dirtyKeys.size > 0;

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const msg = event.data?.pluginMessage as ComposerMessage | undefined;
            if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("COMPOSER.")) return;
            switch (msg.type) {
                case ComposerMessages.LOADED:
                    resetFromDocument(msg.styles, msg.catalog);
                    setSettings(msg.settings);
                    setCanEdit(msg.canEdit);
                    setLoaded(true);
                    break;
                case ComposerMessages.LIBRARY_LOADED:
                    setCatalog(msg.catalog);
                    setLibraryLoading(false);
                    break;
                case ComposerMessages.PREVIEW_RESULT: {
                    if (msg.requestId !== previewRequest.current) break;
                    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
                    previewUrl.current = msg.png ? URL.createObjectURL(new Blob([new Uint8Array(msg.png)], { type: "image/png" })) : undefined;
                    setExact({ url: previewUrl.current, width: msg.width, height: msg.height, error: msg.error, pending: false });
                    break;
                }
                case ComposerMessages.USAGE_RESULT: {
                    window.clearTimeout(usageTimers.current.get(msg.styleId));
                    setUsage((prev) => {
                        if (prev.get(msg.styleId)?.status === "cancelled") return prev;
                        return new Map(prev).set(msg.styleId, { status: "done", count: msg.count, capped: msg.capped });
                    });
                    break;
                }
                case ComposerMessages.APPLY_RESULT:
                    setApplying(false);
                    setApplyResult(msg.result);
                    resetFromDocument(msg.styles, msg.catalog);
                    break;
                case ComposerMessages.DOCUMENT_CHANGED:
                    // Edits made in Figma meanwhile: reload straight away unless that would throw work away.
                    if (dirtyRef.current) setExternalChange(true);
                    else post({ type: ComposerMessages.LOAD });
                    break;
                case ComposerMessages.ERROR:
                    setApplying(false);
                    setError(msg.error);
                    break;
            }
        };
        window.addEventListener("message", onMessage);
        post({ type: ComposerMessages.LOAD });
        return () => {
            window.removeEventListener("message", onMessage);
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        };
    }, [resetFromDocument]);

    const selected = selectedKey ? drafts.get(selectedKey) ?? null : null;

    // Exact preview: debounced, and only the newest request's answer is shown.
    useEffect(() => {
        window.clearTimeout(previewTimer.current);
        if (!selected || selected.kind === "GRID") {
            setExact({ pending: false });
            return;
        }
        setExact((prev) => ({ ...prev, pending: true }));
        previewTimer.current = window.setTimeout(() => {
            const requestId = ++previewRequest.current;
            post({ type: ComposerMessages.PREVIEW, requestId, draft: selected, modes, sampleText });
        }, PREVIEW_DEBOUNCE_MS);
        return () => window.clearTimeout(previewTimer.current);
    }, [selected, modes, sampleText]);

    const requestUsage = useCallback((styleId: string) => {
        setUsage((prev) => new Map(prev).set(styleId, { status: "counting" }));
        usageTimers.current.set(styleId, window.setTimeout(() => {
            setUsage((prev) => (prev.get(styleId)?.status === "counting" ? new Map(prev).set(styleId, { status: "slow" }) : prev));
        }, USAGE_SLOW_MS));
        post({ type: ComposerMessages.USAGE, styleId, cap: USAGE_CAP });
    }, []);

    const cancelUsage = useCallback((styleId: string) => {
        window.clearTimeout(usageTimers.current.get(styleId));
        setUsage((prev) => new Map(prev).set(styleId, { status: "cancelled" }));
    }, []);

    // Count usage lazily, for the selected stored style only.
    useEffect(() => {
        const id = selected?.id;
        if (id && !usage.has(id)) requestUsage(id);
    }, [selected?.id, usage, requestUsage]);

    const updateDraft = useCallback((key: string, next: StyleDraft) => {
        setDrafts((prev) => new Map(prev).set(key, next));
    }, []);

    const updateMany = useCallback((next: StyleDraft[]) => {
        setDrafts((prev) => {
            const map = new Map(prev);
            for (const d of next) map.set(d.key, d);
            return map;
        });
    }, []);

    const addDrafts = useCallback((next: StyleDraft[]) => {
        const fresh = next.filter((d) => !d.id);
        updateMany(next);
        setOrder((prev) => [...prev, ...fresh.map((d) => d.key).filter((k) => !prev.includes(k))]);
        if (next[0]) setSelectedKey(next[0].key);
    }, [updateMany]);

    const createStyle = useCallback((kind: StyleKind) => {
        const draft = newDraft(kind, `new ${kind.toLowerCase()} style`);
        addDrafts([draft]);
    }, [addDrafts]);

    const duplicateStyle = useCallback((key: string) => {
        const source = drafts.get(key);
        if (!source) return;
        const copy = newDraft(source.kind, `${source.name} copy`);
        addDrafts([{ ...JSON.parse(JSON.stringify(source)), id: undefined, key: copy.key, name: copy.name }]);
    }, [drafts, addDrafts]);

    /** Deleting a style that was never saved just drops it; a stored one is marked for review. */
    const toggleDelete = useCallback((key: string) => {
        const draft = drafts.get(key);
        if (!draft) return;
        if (!draft.id) {
            setDrafts((prev) => { const m = new Map(prev); m.delete(key); return m; });
            setOrder((prev) => prev.filter((k) => k !== key));
            setSelectedKey((k) => (k === key ? null : k));
            return;
        }
        setDeleted((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }, [drafts]);

    /** Moves a style up (-1) or down (+1) past its neighbour in the same kind and folder. */
    const moveStyle = useCallback((key: string, delta: -1 | 1) => {
        const draft = drafts.get(key);
        if (!draft) return;
        const folder = folderOf(draft);
        setOrder((prev) => {
            const i = prev.indexOf(key);
            let j = i + delta;
            while (j >= 0 && j < prev.length && folderOf(drafts.get(prev[j]) ?? draft) !== folder) j += delta;
            if (j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
        setOrderTouched(true);
    }, [drafts]);

    const revert = useCallback((key: string) => {
        const stored = original.get(key);
        if (stored) updateDraft(key, stored);
        setDeleted((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }, [original, updateDraft]);

    const discardAll = useCallback(() => {
        resetFromDocument([...original.values()], catalog);
    }, [original, catalog, resetFromDocument]);

    const apply = useCallback(() => {
        setApplying(true);
        setError(null);
        setApplyResult(null);
        const upserts = changes
            .filter((c) => c.action !== "delete")
            .map((c) => drafts.get(c.key)!)
            .filter(Boolean);
        const deletes = changes.filter((c) => c.action === "delete").map((c) => drafts.get(c.key)!.id!);
        const ordered = orderChanged
            ? order.filter((k) => !deleted.has(k)).map((k) => drafts.get(k)!).filter(Boolean).map((d) => ({ key: d.key, id: d.id, kind: d.kind }))
            : undefined;
        post({ type: ComposerMessages.APPLY, ops: { upserts, deletes, order: ordered } });
    }, [changes, drafts, orderChanged, order, deleted]);

    const saveSettings = useCallback((next: ComposerSettings) => {
        setSettings(next);
        post({ type: ComposerMessages.SAVE_SETTINGS, settings: next });
    }, []);

    return {
        loaded, canEdit, catalog, index, libraryLoading, settings, saveSettings,
        order, drafts, original, deleted, dirtyKeys, changes, orderChanged, moveStyle,
        selected, selectedKey, setSelectedKey, checked, setChecked,
        modes, setModes, sampleText, setSampleText, exact,
        usage, requestUsage, cancelUsage,
        updateDraft, updateMany, addDrafts, createStyle, duplicateStyle, toggleDelete, revert, discardAll,
        apply, applying, applyResult, setApplyResult, error, setError, externalChange, reload,
    };
};

export type ComposerState = ReturnType<typeof useComposer>;

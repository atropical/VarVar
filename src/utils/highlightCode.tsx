import React from "react";
import { OutputFormats } from "../types.d";

type TokenRule = {
    type: string;
    regex: RegExp;
};

type Token = {
    type: string | null;
    text: string;
};

const JSON_RULES: TokenRule[] = [
    { type: "key", regex: /"(?:\\.|[^"\\])*"(?=\s*:)/y },
    { type: "string", regex: /"(?:\\.|[^"\\])*"/y },
    { type: "number", regex: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y },
    { type: "boolean", regex: /\b(?:true|false|null)\b/y },
    { type: "punctuation", regex: /[{}[\]:,]/y },
];

const CSS_RULES: TokenRule[] = [
    { type: "comment", regex: /\/\*[\s\S]*?\*\//y },
    { type: "string", regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y },
    { type: "hex", regex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/y },
    { type: "function", regex: /[-a-zA-Z_][-a-zA-Z0-9_]*(?=\()/y },
    { type: "selector", regex: /[.#]?[-\w]+(?=\s*\{)/y },
    { type: "property", regex: /(?:--)?[-a-zA-Z0-9_]+(?=\s*:)/y },
    // Catch-all for identifiers (custom property names in var(...), keywords
    // like `red` or `flex`, etc.) so a trailing digit - e.g. the `2` in
    // `--headline-2` - isn't matched on its own by the number rule below.
    { type: "identifier", regex: /-{0,2}[a-zA-Z_][-a-zA-Z0-9_]*/y },
    { type: "number", regex: /-?\b\d+(?:\.\d+)?(?:px|rem|em|%|deg|s|ms|vh|vw)?\b/y },
    { type: "punctuation", regex: /[{}();:,]/y },
    { type: "atrule", regex: /@[-a-zA-Z]+/y },
];

const JS_RULES: TokenRule[] = [
    { type: "comment", regex: /\/\/.*|\/\*[\s\S]*?\*\//y },
    { type: "string", regex: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/y },
    {
        type: "keyword",
        regex: /\b(?:const|let|var|function|return|if|else|for|while|import|export|from|default|type|interface|enum|as|of|in|new|typeof|extends|implements|class|public|private|readonly|void|async|await)\b/y,
    },
    { type: "boolean", regex: /\b(?:true|false|null|undefined)\b/y },
    { type: "number", regex: /-?\b\d+(?:\.\d+)?\b/y },
    { type: "punctuation", regex: /[{}[\]().,;:]/y },
];

const CSV_RULES: TokenRule[] = [
    { type: "string", regex: /"(?:\\.|[^"\\])*"/y },
    { type: "punctuation", regex: /,/y },
];

function rulesForLanguage(language: string): TokenRule[] {
    switch (language) {
        case OutputFormats.JSON:
            return JSON_RULES;
        case OutputFormats.CSS:
            return CSS_RULES;
        case OutputFormats.JS:
        case OutputFormats.TS:
            return JS_RULES;
        case OutputFormats.CSV:
            return CSV_RULES;
        default:
            return [];
    }
}

/**
 * Tokenizes `code` against `rules` (sticky regex, tried in order at each
 * position, so more specific patterns must come first - e.g. JSON "key"
 * before generic "string"). Unrecognized characters come back as `type: null`
 * runs.
 */
function tokenize(code: string, language: string): Token[] {
    const rules = rulesForLanguage(language);
    if (rules.length === 0) return [{ type: null, text: code }];

    const tokens: Token[] = [];
    let pos = 0;
    let plainStart = 0;

    while (pos < code.length) {
        let matched = false;

        for (const rule of rules) {
            rule.regex.lastIndex = pos;
            const match = rule.regex.exec(code);
            if (match && match.index === pos) {
                if (plainStart < pos) {
                    tokens.push({ type: null, text: code.slice(plainStart, pos) });
                }
                tokens.push({ type: rule.type, text: match[0] });
                pos += match[0].length;
                plainStart = pos;
                matched = true;
                break;
            }
        }

        if (!matched) pos += 1;
    }

    if (plainStart < code.length) {
        tokens.push({ type: null, text: code.slice(plainStart) });
    }

    return tokens;
}

/**
 * Splits a flat token stream on newlines into per-line token groups. A token
 * spanning multiple lines (e.g. a block comment) keeps its type on every
 * line it touches.
 */
function splitTokensIntoLines(tokens: Token[]): Token[][] {
    const lines: Token[][] = [[]];

    for (const token of tokens) {
        const parts = token.text.split("\n");
        parts.forEach((part, index) => {
            if (index > 0) lines.push([]);
            if (part.length > 0) lines[lines.length - 1].push({ type: token.type, text: part });
        });
    }

    return lines;
}

/**
 * Renders `code` as numbered, syntax-highlighted lines. Line numbers are
 * marked non-editable and non-selectable (`user-select: none` in
 * highlightCode.css) so they never end up in a copy/paste of the code.
 */
export function renderCodeLines(code: string, language?: string): React.ReactNode {
    const tokens = language ? tokenize(code, language) : [{ type: null, text: code }];
    const lines = splitTokensIntoLines(tokens);

    return (
        <>
            {lines.map((line, lineIndex) => (
                <div className="vv-line" key={lineIndex}>
                    <span className="vv-line-number" contentEditable={false}>
                        {lineIndex + 1}
                    </span>
                    <span className="vv-line-content">
                        {line.map((token, tokenIndex) =>
                            token.type ? (
                                <span key={tokenIndex} className={`vv-tok vv-tok-${token.type}`}>
                                    {token.text}
                                </span>
                            ) : (
                                token.text
                            )
                        )}
                    </span>
                </div>
            ))}
        </>
    );
}

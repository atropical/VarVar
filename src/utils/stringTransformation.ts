export const toCssVar = (string: string, prependDoubleDash: boolean = false) => {
    string = (prependDoubleDash ? `--${string}` : string)
                .replace(/\//g, "--")
                .replace(/\s/g, '-')
                .replace(/\./g, '_')
                .toLowerCase();
    return string;
}

export const toCamelCase = (string: string) => {
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

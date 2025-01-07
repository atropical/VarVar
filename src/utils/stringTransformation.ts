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
        .replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) => 
            index === 0 ? match.toLowerCase() : match.toUpperCase()
        )
        .replace(/-/g, '_');
}

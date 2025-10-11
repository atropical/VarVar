/**
 * Unsecured fallback for copying text to clipboard
 * @param text - The text to be copied to the clipboard
 */
function unsecuredCopyToClipboard(text: string): boolean {
    // Create a textarea element
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);

    // Focus and select the textarea content
    textArea.focus();
    textArea.select();

    // Attempt to copy the text to the clipboard
    try {
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
    } catch (e) {
        console.error('Unable to copy content to clipboard!', e);
        document.body.removeChild(textArea);
        return false;
    }
}

/**
 * Copies the text passed as param to the system clipboard
 * Check if using HTTPS and navigator.clipboard is available
 * Then uses standard clipboard API, otherwise uses fallback
 *
 * @param content - The content to be copied to the clipboard
 * @returns Promise<boolean> - Success status
 */
export async function copyToClipboard(content: string): Promise<boolean> {
    // If the context is secure and clipboard API is available, use it
    if (
        window.isSecureContext &&
        typeof navigator?.clipboard?.writeText === 'function'
    ) {
        try {
            await navigator.clipboard.writeText(content);
            return true;
        } catch (e) {
            console.warn('Clipboard API failed, falling back to execCommand:', e);
            return unsecuredCopyToClipboard(content);
        }
    }
    // Otherwise, use the unsecured fallback
    else {
        return unsecuredCopyToClipboard(content);
    }
}

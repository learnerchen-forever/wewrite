/**
 * Utility functions to convert all a tags to strong tags
 * This can be used in UI to replace links with strong tags on demand
 */

export class LinkToStrong {
    /**
     * Replaces all <a> tags with <strong> tags while preserving the content and styles
     * @param html The HTML string containing a tags to be replaced
     * @returns HTML string with a tags replaced by strong tags, preserving styles
     */
    static convertATagsToStrongTags(html: string): string {
        // Replace all <a> tags with <strong> tags while preserving attributes (especially style attributes)
        // This regex captures the attributes from the opening <a> tag and transfers them to the <strong> tag
        return html.replace(/<a([^>]*)>(.*?)<\/a>/g, (match, attributes, content) => {
            // We only want to preserve certain attributes like style, class, etc.
            // Filter out href and other link-specific attributes
            const preservedAttributes = attributes
                .replace(/\s*href\s*=\s*["'][^"']*["']/gi, '') // Remove href attribute
                .replace(/\s*target\s*=\s*["'][^"']*["']/gi, '') // Remove target attribute
                .replace(/\s*rel\s*=\s*["'][^"']*["']/gi, '') // Remove rel attribute
                .trim();
            
            if (preservedAttributes) {
                return `<strong ${preservedAttributes}>${content}</strong>`;
            } else {
                return `<strong>${content}</strong>`;
            }
        });
    }
}
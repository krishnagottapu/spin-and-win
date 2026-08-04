/**
 * Generates a URL-safe slug from an event name.
 * - Converts to lowercase
 * - Replaces spaces and special characters with hyphens
 * - Removes leading/trailing hyphens
 * - Collapses multiple consecutive hyphens
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Generates a slug with a random 4-character suffix for deduplication.
 */
export function slugifyWithSuffix(input: string): string {
  const base = slugify(input);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}
